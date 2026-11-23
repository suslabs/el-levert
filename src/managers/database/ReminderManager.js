import DBManager from "./DBManager.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";

import { getClient, getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import DatabaseUtil from "../../util/database/DatabaseUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";
import IntervalLoop from "../../util/misc/IntervalLoop.js";
import SnoozeUtil from "../../util/commands/SnoozeUtil.js";
import DateUtil from "../../util/commands/DateUtil.js";

import ReminderError from "../../errors/ReminderError.js";

function logTime() {
    const elapsed = Benchmark.stopTiming("send_reminders", false);
    getLogger().info(`Sending reminders took ${Util.formatNumber(elapsed)} ms.`);
}

class ReminderManager extends DBManager {
    static $name = "reminderManager";
    static loadPriority = 3;

    static defaultListLimit = 5;
    static maxMsgLength = 512;
    static areWeChecking = false;

    constructor(enabled) {
        super(enabled, "reminder", "remind_db", ReminderDatabase);

        this.sendInterval = getConfig().reminderSendInterval;
        this.maxMsgLength = Util.clamp(ReminderManager.maxMsgLength, 0, DiscordUtil.msgCharLimit - 500);

        this._sendLoop = new IntervalLoop(
            () => this._sendReminders(),
            this.sendInterval,
            err => getLogger().error("Could not send reminders:", err)
        );

        this._lastSentReminders = new Map();
        this._lastSentOccurrences = new Map();
    }

    checkIndex(index, throwErrors = true) {
        let msg, ref;

        if (!Number.isInteger(index) || index < 0) {
            msg = "Invalid reminder index";
            ref = { index };
        }

        const errored = typeof msg !== "undefined";

        if (throwErrors) {
            return errored
                ? (() => {
                      throw new ReminderError(msg, ref);
                  })()
                : index;
        } else {
            return errored ? [null, msg] : [index, null];
        }
    }

    checkMessage(remMsg, throwErrors = true) {
        let msg, ref;

        if (remMsg == null) {
            return throwErrors ? remMsg : [remMsg, null];
        }

        let oversized;
        remMsg = String(remMsg ?? "").trim();

        if (Util.empty(remMsg)) {
            msg = "Invalid reminder message";
        } else if ((oversized = Util.overSizeLimits(remMsg, this.maxMsgLength, 1))) {
            const [chars, lines] = oversized;

            if (chars !== null) {
                msg = `Reminder messages can be at most ${this.maxMsgLength} characters long.`;
                ref = {
                    msgLength: remMsg.length,
                    maxLength: this.maxMsgLength
                };
            } else if (lines !== null) {
                msg = "Reminder messages can only contain a single line.";
                ref = {
                    lineCount: lines,
                    maxLines: 1
                };
            }
        }

        const errored = typeof msg !== "undefined";

        if (throwErrors) {
            return errored
                ? (() => {
                      throw new ReminderError(msg, ref);
                  })()
                : remMsg;
        } else {
            return errored ? [null, msg] : [remMsg, null];
        }
    }

    async list(options = {}, pagination = {}) {
        options = ObjectUtil.guaranteeObject(options, "user");
        pagination = ObjectUtil.guaranteeObject(pagination, "limit");

        const user = options.user;

        const totalCount = await this.remind_db.count(user);

        if (totalCount === 0) {
            return {
                items: [],
                totalCount: 0
            };
        }

        const { limit, offset } = DatabaseUtil.resolvePagination(pagination, ReminderManager.defaultListLimit);

        const items = (await this.remind_db.fetch(user, { limit, offset })) ?? [];

        return {
            items,
            totalCount
        };
    }

    async exists(user) {
        if (!this.enabled) {
            return Array.isArray(user) ? user.map(_ => false) : false;
        }

        return await this.remind_db.exists(user);
    }

    async listAll() {
        return await this.remind_db.list();
    }

    async add(user, start, msg, validate = true, interval = null, end = null) {
        if (validate) {
            if (!Number.isSafeInteger(start) || (interval === null && start < Date.now())) {
                throw new ReminderError("Invalid start time", start);
            } else if (interval !== null && !DateUtil.isValidInterval(interval)) {
                throw new ReminderError("Invalid reminder interval", interval);
            } else if (end !== null && (!Number.isInteger(end) || interval === null || end < start)) {
                throw new ReminderError("Invalid reminder end time", end);
            }

            msg = this.checkMessage(msg);
        }

        const reminder = new Reminder({
            user,
            start,
            end,
            msg,
            interval
        });
        await this.remind_db.add(reminder);

        const intervalStr = reminder.isRecurring ? ` every ${DateUtil.formatInterval(reminder.interval)}` : "";
        getLogger().info(
            `Added reminder for user: ${user} starting: ${start}${intervalStr} with message:${LoggerUtil.formatLog(msg)}`
        );

        return reminder;
    }

    async edit(user, index, start = null, interval, validate = true, end) {
        if (validate) {
            index = this.checkIndex(index);
        }

        const { items: reminders } = await this.list({ user }, { all: true }),
            reminder = reminders[index];

        if (typeof reminder === "undefined") {
            throw new ReminderError("Reminder doesn't exist");
        }

        if (interval === null && reminder.isRecurring && start === null) {
            start = reminder.getOccurrence(reminder.getOccurrenceIndex(Date.now(), true));
        }

        const hasEnd = typeof end !== "undefined";
        end = hasEnd ? end : interval === null ? null : reminder.end;

        const nextInterval = typeof interval === "undefined" ? reminder.interval : interval,
            nextStart = start ?? reminder.start;

        if (validate) {
            if (start !== null && (!Number.isInteger(start) || start < Date.now())) {
                throw new ReminderError("Invalid start time", start);
            } else if (interval != null && !DateUtil.isValidInterval(interval)) {
                throw new ReminderError("Invalid reminder interval", interval);
            } else if (
                end !== null &&
                ((hasEnd && !Number.isInteger(end)) || nextInterval === null || end < nextStart)
            ) {
                throw new ReminderError("Invalid reminder end time", end);
            }
        }

        if (start !== null) {
            reminder.start = start;
        }

        if (typeof interval !== "undefined") {
            reminder.interval = interval;
        }

        if (hasEnd || interval === null) {
            reminder.end = end;
        }

        const result = await this.remind_db.update(reminder);

        if (result.changes === 0) {
            throw new ReminderError("Reminder doesn't exist");
        }

        this._lastSentOccurrences.delete(reminder.id);

        const intervalStr = reminder.isRecurring ? ` every ${DateUtil.formatInterval(reminder.interval)}` : "";
        getLogger().info(
            `Updated reminder: ${index} for user: ${user} starting: ${reminder.start}${intervalStr} with message:${LoggerUtil.formatLog(reminder.msg)}`
        );

        return reminder;
    }

    async snooze(user, target, duration) {
        if (!Number.isInteger(duration) || duration <= 0) {
            throw new ReminderError("Invalid snooze duration", duration);
        }

        let reminder = null,
            isNew = false;

        if (target instanceof Reminder) {
            reminder = target;
        } else {
            const { items: reminders } = await this.list({ user }, { all: true });

            if (Util.empty(reminders)) {
                reminder = this._lastSentReminders.get(user);
                if (typeof reminder === "undefined") {
                    throw new ReminderError("No reminders to snooze");
                }
            } else {
                const idx = typeof target === "number" ? target : 0;
                this.checkIndex(idx);
                reminder = reminders[idx];

                if (typeof reminder === "undefined") {
                    throw new ReminderError("Reminder doesn't exist");
                }
            }
        }

        const existing = reminder.id ? await this.remind_db.fetchById(reminder.id) : null;

        if (reminder.isRecurring || existing === null) {
            isNew = true;
            reminder = new Reminder({ user, start: Date.now() + duration, msg: reminder.msg });
        } else {
            reminder = existing;
            reminder.start = Math.max(reminder.start, Date.now()) + duration;
        }

        if (isNew) {
            await this.remind_db.add(reminder);
        } else {
            const result = await this.remind_db.update(reminder);

            if (result.changes === 0) {
                throw new ReminderError("Reminder doesn't exist");
            }

            this._lastSentOccurrences.delete(reminder.id);
        }

        getLogger().info(`Snoozed reminder for user: ${user} until: ${reminder.start}.`);
        return reminder;
    }

    async remove(user, index, validate = false) {
        if (validate) {
            index = this.checkIndex(index);
        }

        const { items: reminders } = await this.list({ user }, { all: true });

        if (Util.empty(reminders)) {
            return null;
        }

        const reminder = reminders[index];

        if (typeof reminder === "undefined") {
            throw new ReminderError("Reminder doesn't exist");
        }

        const res = await this.remind_db.remove(reminder),
            updated = res.changes > 0;

        if (updated) {
            this._lastSentOccurrences.delete(reminder.id);
            getLogger().info(`Removed reminder: ${index} for user: ${user}.`);
        } else if (validate) {
            throw new ReminderError("Reminder doesn't exist", reminder);
        }

        return reminder;
    }

    async removeAll(user) {
        const { items: reminders } = await this.list({ user }, { all: true });

        const res = await this.remind_db.removeAll(user);

        for (const reminder of reminders) {
            this._lastSentOccurrences.delete(reminder.id);
        }

        getLogger().info(`Removed all reminders for user: ${user}`);
        return res.changes > 0;
    }

    async getPastReminders(date) {
        const reminders = await this.listAll();

        const now = date ?? Date.now();

        const due = [],
            expired = [];

        for (const reminder of reminders) {
            const idx = reminder.getOccurrenceIndex(now);

            if (idx === null) {
                continue;
            } else if (this._lastSentOccurrences.get(reminder.id) !== idx) {
                due.push({ reminder, idx });
            } else if (reminder.getOccurrence(idx, true) === null) {
                expired.push(reminder);
            }
        }

        if (!Util.empty(expired)) {
            await this.remind_db.transactionImmediate(async tx => {
                for (const reminder of expired) {
                    await tx.removeScheduled(reminder);
                }
            });
        }

        for (const reminder of expired) {
            this._lastSentOccurrences.delete(reminder.id);
        }

        return due;
    }

    async sendReminder(reminder, idx) {
        const user = await getClient().findUserById(reminder.user);

        if (user === null) {
            await this._completeOccurrence(reminder, idx);
            return;
        }

        const prefix =
            reminder.getOccurrence(idx, true) !== null
                ? "Recurring reminder; next occurrence: "
                : "You set a reminder for ";
        const out = prefix + reminder.format();
        getLogger().info(`Sending reminder to ${DiscordUtil.formatUser(user)}...`);

        const session = SnoozeUtil.createSession(user, reminder),
            row = SnoozeUtil.createSnoozeRow(session.id);

        const msg = await user.send({
            content: out,
            components: [row]
        });

        this._lastSentReminders.set(reminder.user, reminder);
        await this._completeOccurrence(reminder, idx);

        session.setMessage(msg);
    }

    startSendLoop() {
        if (!this.enabled || this._sendLoop.running) {
            return;
        }

        this._sendLoop.start();
        getLogger().info("Started reminder loop.");
    }

    async unload() {
        await this._sendLoop.stop();
        await super.unload();

        this._lastSentReminders.clear();
        this._lastSentOccurrences.clear();
    }

    async _completeOccurrence(reminder, idx) {
        const current = await this.remind_db.fetchById(reminder.id);

        if (
            current === null ||
            current.start !== reminder.start ||
            current.end !== reminder.end ||
            current.interval !== reminder.interval
        ) {
            return;
        }

        this._lastSentOccurrences.set(reminder.id, idx);

        if (reminder.getOccurrence(idx, true) === null) {
            await this.remind_db.removeScheduled(reminder);
            this._lastSentOccurrences.delete(reminder.id);
        }
    }

    _sendReminders = async () => {
        Benchmark.startTiming("send_reminders");

        try {
            if (ReminderManager.areWeChecking && getLogger().isDebugEnabled()) {
                const interval = Util.round(this.sendInterval * Util.durationSeconds.milli, 1);
                getLogger().debug(`Checking reminders... (${interval}s)`);
            }

            const reminders = await this.getPastReminders();

            if (Util.empty(reminders)) {
                ReminderManager.areWeChecking && getLogger().debug("No reminders to send.");
                Benchmark.stopTiming("send_reminders", null);
                return;
            }

            getLogger().info(`Sending ${reminders.length} reminder(s)...`);
            const results = await Promise.allSettled(
                reminders.map(({ reminder, idx }) => this.sendReminder(reminder, idx))
            );
            const failed = results.find(result => result.status === "rejected");

            if (typeof failed !== "undefined") {
                throw failed.reason;
            }

            logTime();
        } catch (err) {
            Benchmark.stopTiming("send_reminders", null);
            throw err;
        }
    };
}

export default ReminderManager;
