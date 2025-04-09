import DBManager from "./DBManager.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import TypeTester from "../../util/TypeTester.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import ReminderError from "../../errors/ReminderError.js";

function logTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending reminders took ${Util.formatNumber(Util.timeDelta(t2, t1))}ms.`);
}

class ReminderManager extends DBManager {
    static $name = "reminderManager";
    static loadPriority = 3;

    static maxMsgLength = 512;

    constructor(enabled) {
        super(enabled, "reminder", "remind_db", ReminderDatabase);

        this.sendInterval = getClient().config.reminderSendInterval;
        this.maxMsgLength = Util.clamp(ReminderManager.maxMsgLength, 0, DiscordUtil.msgCharLimit - 500);

        this._sendTimer = null;
    }

    checkMessage(msg) {
        const oversized = TypeTester.overSizeLimits(msg, this.maxMsgLength, 1);

        if (!oversized) {
            return false;
        }

        const [chars, lines] = oversized;

        if (chars !== null) {
            return `Reminder messages can be at most ${this.maxMsgLength} characters long.`;
        } else if (lines !== null) {
            return "Reminder messages can only contain a single line.";
        }
    }

    async list(user) {
        const reminders = await this.remind_db.fetch(user);

        if (reminders === null) {
            return null;
        }

        return reminders;
    }

    async listAll() {
        return await this.remind_db.list();
    }

    async add(user, end, msg) {
        if (end < Date.now()) {
            throw new ReminderError("Invalid end time");
        }

        msg = msg?.trim();
        const reminder = new Reminder({ user, end, msg });

        await this.remind_db.add(reminder);

        getLogger().info(`Added reminder for user: ${user} until: ${end} with message:${LoggerUtil.formatLog(msg)}`);
        return reminder;
    }

    async remove(user, index) {
        const reminders = await this.list(user);

        if (reminders === null) {
            return false;
        }

        const reminder = reminders[index];

        if (typeof reminder === "undefined") {
            throw new ReminderError("Reminder doesn't exist");
        }

        await this.remind_db.remove(reminder);

        getLogger().info(`Removed reminder: ${index} for user: ${user}.`);
        return true;
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

        const out = "You set a reminder for " + reminder.format();

        getLogger().info(`Sending reminder to ${user.id} (${user.username})...`);
        await user.send(out);
    }

    startSendLoop() {
        if (!this.enabled || this._sendTimer !== null) {
            return;
        }

        const sendFunc = this._sendReminders.bind(this);
        this._sendTimer = setInterval(sendFunc, this.sendInterval);

        getLogger().info("Started reminder loop.");
    }

    async unload() {
        await super.unload();
        this._stopSendLoop();
    }

    async _sendReminders() {
        getLogger().debug(`Checking reminders... (${Util.round(this.sendInterval * Util.durationSeconds.milli, 1)}s)`);
        const t1 = performance.now();

        const reminders = await this.getPastReminders();

        if (Util.empty(reminders)) {
            getLogger().debug("No reminders to send.");
            return;
        }

        getLogger().info(`Sending ${reminders.length} reminder(s)...`);
        await Promise.all(reminders.map(reminder => this.sendReminder(reminder)));

        logTime(t1);
    }

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
