import DBManager from "./DBManager.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";

import { getClient, getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";
import SnoozeUtil from "../../util/commands/SnoozeUtil.js";

import ReminderError from "../../errors/ReminderError.js";

function logTime() {
    const elapsed = Benchmark.stopTiming("send_reminders", false);
    getLogger().info(`Sending reminders took ${Util.formatNumber(elapsed)} ms.`);
}

class ReminderManager extends DBManager {
    static $name = "reminderManager";
    static loadPriority = 3;

    static maxMsgLength = 512;
    static areWeChecking = false;

    constructor(enabled) {
        super(enabled, "reminder", "remind_db", ReminderDatabase);

        this.sendInterval = getConfig().reminderSendInterval;
        this.maxMsgLength = Util.clamp(ReminderManager.maxMsgLength, 0, DiscordUtil.msgCharLimit - 500);

        this._sendTimer = null;
        this._lastSentReminders = new Map();
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

    async list(user) {
        return await this.remind_db.fetch(user);
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

    async add(user, end, msg, validate = true, interval = null) {
        if (validate) {
            if (!Number.isInteger(end) || end < Date.now()) {
                throw new ReminderError("Invalid end time", end);
            } else if (interval !== null && (!Number.isInteger(interval) || interval <= 0)) {
                throw new ReminderError("Invalid reminder interval", interval);
            }

            msg = this.checkMessage(msg);
        }

        const reminder = new Reminder({ user, end, msg, interval });
        await this.remind_db.add(reminder);

        const intervalStr = reminder.isRecurring ? ` every ${reminder.interval}ms` : "";
        getLogger().info(
            `Added reminder for user: ${user} until: ${end}${intervalStr} with message:${LoggerUtil.formatLog(msg)}`
        );

        return reminder;
    }

    async edit(user, index, end = null, interval, validate = true) {
        if (validate) {
            index = this.checkIndex(index);
        }

        const reminders = await this.list(user),
            reminder = reminders?.[index];

        if (reminders === null || typeof reminder === "undefined") {
            throw new ReminderError("Reminder doesn't exist");
        }

        if (validate) {
            if (end !== null && (!Number.isInteger(end) || end < Date.now())) {
                throw new ReminderError("Invalid end time", end);
            } else if (interval != null && (!Number.isInteger(interval) || interval <= 0)) {
                throw new ReminderError("Invalid reminder interval", interval);
            }
        }

        if (end !== null) {
            reminder.end = end;
        }

        if (typeof interval !== "undefined") {
            reminder.interval = interval;
        }

        await this.remind_db.update(reminder);

        const intervalStr = reminder.isRecurring ? ` every ${reminder.interval}ms` : "";
        getLogger().info(
            `Updated reminder: ${index} for user: ${user} until: ${reminder.end}${intervalStr} with message:${LoggerUtil.formatLog(reminder.msg)}`
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
            const existing = target.id ? await this.remind_db.fetchById(target.id) : null;

            if (existing !== null) {
                reminder = existing;
                reminder.end = Math.max(reminder.end, Date.now()) + duration;
            } else {
                isNew = true;
                reminder = new Reminder({
                    user,
                    end: Date.now() + duration,
                    msg: target.msg,
                    interval: null
                });
            }
        } else {
            const reminders = await this.list(user);

            if (Util.empty(reminders)) {
                const lastSent = this._lastSentReminders.get(user);

                if (typeof lastSent !== "undefined") {
                    isNew = true;
                    reminder = new Reminder({
                        user,
                        end: Date.now() + duration,
                        msg: lastSent.msg,
                        interval: null
                    });
                } else {
                    throw new ReminderError("No reminders to snooze");
                }
            } else {
                let idx = 0;

                if (typeof target === "number") {
                    idx = target;
                }

                this.checkIndex(idx);
                reminder = reminders[idx];

                if (typeof reminder === "undefined") {
                    throw new ReminderError("Reminder doesn't exist");
                }

                reminder.end = Math.max(reminder.end, Date.now()) + duration;
            }
        }

        if (isNew) {
            await this.remind_db.add(reminder);
        } else {
            await this.remind_db.update(reminder);
        }

        getLogger().info(`Snoozed reminder for user: ${user} until: ${reminder.end}.`);
        return reminder;
    }

    async remove(user, index, validate = false) {
        if (validate) {
            index = this.checkIndex(index);
        }

        const reminders = await this.list(user),
            reminder = reminders?.[index];

        if (reminders === null) {
            return null;
        } else if (typeof reminder === "undefined") {
            throw new ReminderError("Reminder doesn't exist");
        }

        const res = await this.remind_db.remove(reminder),
            updated = res.changes > 0;

        if (updated) {
            getLogger().info(`Removed reminder: ${index} for user: ${user}.`);
        } else if (validate) {
            throw new ReminderError("Reminder doesn't exist", reminder);
        }

        return reminder;
    }

    async removeAll(user) {
        const res = await this.remind_db.removeAll(user);

        getLogger().info(`Removed all reminders for user: ${user}`);
        return res.changes > 0;
    }

    async getPastReminders(date) {
        const reminders = await this.listAll(),
            past = reminders.filter(reminder => reminder.isPast(date));

        const now = date ?? Date.now();

        await this.remind_db.transactionImmediate(async tx => {
            for (const reminder of past) {
                if (reminder.isRecurring) {
                    while (reminder.end <= now) {
                        reminder.end += reminder.interval;
                    }

                    await tx.update(reminder);
                } else {
                    await tx.remove(reminder);
                }
            }
        });

        return past;
    }

    async sendReminder(reminder) {
        reminder = Reminder.from(reminder, true);

        if (reminder === null) {
            return;
        }

        const user = await getClient().findUserById(reminder.user);

        if (user === null) {
            return;
        }

        this._lastSentReminders.set(reminder.user, reminder);

        const out = "You set a reminder for " + reminder.format();
        getLogger().info(`Sending reminder to ${DiscordUtil.formatUser(user)}...`);

        const session = SnoozeUtil.createSession(user, reminder),
            row = SnoozeUtil.createSnoozeRow(session.id);

        const msg = await user.send({
            content: out,
            components: [row]
        });

        if (typeof msg !== "undefined") {
            session.setMessage(msg);
        }
    }

    startSendLoop() {
        if (!this.enabled || this._sendTimer !== null) {
            return;
        }

        this._sendTimer = setInterval(this._sendReminders, this.sendInterval);
        getLogger().info("Started reminder loop.");
    }

    async unload() {
        await super.unload();

        this._stopSendLoop();
        this._lastSentReminders.clear();
    }

    _sendReminders = async () => {
        Benchmark.startTiming("send_reminders");

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
        await Promise.all(reminders.map(reminder => this.sendReminder(reminder)));

        logTime();
    };

    _stopSendLoop() {
        if (this._sendTimer === null) {
            return;
        }

        clearInterval(this._sendTimer);
        this._sendTimer = null;

        getLogger().info("Stopped reminder loop.");
    }
}

export default ReminderManager;
