import DBManager from "./DBManager.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";
import ReminderError from "../../errors/ReminderError.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

function logTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending reminders took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

class ReminderManager extends DBManager {
    static $name = "reminderManager";
    static loadPriority = 3;

    static maxMsgLength = 512;

    constructor(enabled) {
        super(enabled, "reminder", ReminderDatabase, "remind_db");

        const sendInterval = getClient().config.reminderSendInterval,
            intervalMs = Math.floor(sendInterval / Util.durationSeconds.milli);

        this.intervalSeconds = sendInterval;
        this.sendInterval = intervalMs;

        this.maxMsgLength = Util.clamp(ReminderManager.maxMsgLength, 0, 1500);
    }

    checkMessage(msg) {
        if (msg.length > this.maxMsgLength) {
            return `Reminder messages can be at most ${this.maxMsgLength} characters long.`;
        }

        if (msg.indexOf("\n") !== -1) {
            return "Reminder messages can only contain a single line.";
        }

        return false;
    }

    async list(user) {
        const reminders = await this.remind_db.fetch(user);

        if (!reminders) {
            return false;
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

        getLogger().info(`Added reminder for user: ${user} until: ${end} with message:${Util.formatLog(msg)}`);
        return reminder;
    }

    async remove(user, index) {
        const reminders = await this.list(user);

        if (!reminders) {
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

        for (const reminder of past) {
            await this.remind_db.remove(reminder);
        }

        return past;
    }

    async sendReminder(reminder) {
        const user = await getClient().findUserById(reminder.user);

        if (!user) {
            return;
        }

        const out = "You set a reminder for " + reminder.format();

        getLogger().info(`Sending reminder to ${user.id} (${user.username})...`);
        await user.send(out);
    }

    startSendLoop() {
        if (!this.enabled) {
            return;
        }

        const sendFunc = this._sendReminders.bind(this);
        this._sendTimer = setInterval(sendFunc, this.sendInterval);

        getLogger().info("Started reminder loop.");
    }

    unload() {
        this._stopSendLoop();
    }

    async _sendReminders() {
        getLogger().debug(`Checking reminders... (${Util.round(this.intervalSeconds, 1)}s)`);

        const t1 = performance.now(),
            reminders = await this.getPastReminders();

        if (reminders.length < 1) {
            getLogger().debug("No reminders to send.");
            return;
        }

        getLogger().info(`Sending ${reminders.length} reminder(s)...`);

        for (const reminder of reminders) {
            await this.sendReminder(reminder);
        }

        logTime(t1);
    }

    _stopSendLoop() {
        if (typeof this._sendTimer === "undefined") {
            return;
        }

        clearInterval(this._sendTimer);
        delete this._sendTimer;

        getLogger().info("Stopped reminder loop.");
    }
}

export default ReminderManager;
