import DBManager from "./DBManager.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import ReminderError from "../../errors/ReminderError.js";

function logTime(t1) {
    const t2 = performance.now(),
        elapsed = Util.timeDelta(t2, t1);

    getLogger().info(`Sending reminders took ${Util.formatNumber(elapsed)} ms.`);
}

class ReminderManager extends DBManager {
    static $name = "reminderManager";
    static loadPriority = 3;

    static maxMsgLength = 512;
    static areWeChecking = false;

    constructor(enabled) {
        super(enabled, "reminder", "remind_db", ReminderDatabase);

        this.sendInterval = getClient().config.reminderSendInterval;
        this.maxMsgLength = Util.clamp(ReminderManager.maxMsgLength, 0, DiscordUtil.msgCharLimit - 500);

        this._sendTimer = null;
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
        remMsg = remMsg?.trim();

        if (remMsg == null) {
            return throwErrors ? remMsg : [remMsg, null];
        }

        let oversized;

        if (typeof remMsg !== "string") {
            msg = "Invalid reminder message";
        } else if ((oversized = Util.overSizeLimits(remMsg, this.maxMsgLength, 1))) {
            const [chars, lines] = oversized;

            if (chars !== null) {
                msg = `Reminder messages can be at most ${this.maxMsgLength} characters long.`;
                ref = {
                    msgLength: remMsg.length,
                    maxLength: this.maxTagNameLength
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

    async listAll() {
        return await this.remind_db.list();
    }

    async add(user, end, msg, validate = true) {
        if (validate) {
            msg = this.checkMessage(msg);

            if (end < Date.now()) {
                throw new ReminderError("Invalid end time", end);
            }
        }

        const reminder = new Reminder({ user, end, msg });
        await this.remind_db.add(reminder);

        getLogger().info(`Added reminder for user: ${user} until: ${end} with message:${LoggerUtil.formatLog(msg)}`);
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

        await Promise.all(past.map(reminder => this.remind_db.remove(reminder)));
        return past;
    }

    async sendReminder(reminder) {
        const user = await getClient().findUserById(reminder.user);

        if (user === null) {
            return;
        }

        let out = "You set a reminder for " + reminder.format();

        if (!out.endsWith('"')) {
            out += ".";
        }

        getLogger().info(`Sending reminder to ${user.id} (${user.username})...`);
        await user.send(out);
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
    }

    _sendReminders = async () => {
        const t1 = performance.now();

        if (ReminderManager.areWeChecking && getLogger().isDebugEnabled()) {
            const interval = Util.round(this.sendInterval * Util.durationSeconds.milli, 1);
            getLogger().debug(`Checking reminders... (${interval}s)`);
        }

        const reminders = await this.getPastReminders();

        if (Util.empty(reminders)) {
            ReminderManager.areWeChecking && getLogger().debug("No reminders to send.");
            return;
        }

        getLogger().info(`Sending ${reminders.length} reminder(s)...`);
        await Promise.all(reminders.map(reminder => this.sendReminder(reminder)));

        logTime(t1);
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
