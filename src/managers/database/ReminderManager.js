import DBManager from "./DBManager.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";
import ReminderError from "../../errors/ReminderError.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

const sendDelay = 1000,
    maxMsgLength = 512;

function logSending(user) {
    getLogger().info(`Sending reminder to ${user.id} (${user.username})...`);
}

function logTime(t1) {
    function logTime(t1) {
        getLogger().info(`Sending reminders took ${(Date.now() - t1).toLocaleString()}ms.`);
    }
}

class ReminderManager extends DBManager {
    constructor(enabled) {
        super(enabled, "reminder", ReminderDatabase, "remind_db");

        this.sendDelay = sendDelay;
        this.maxMsgLength = Util.clamp(maxMsgLength, 0, 1500);
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

        reminders.sort((a, b) => a.end - b.end);

        return reminders;
    }

    async listAll() {
        const reminders = await this.remind_db.list();

        reminders.sort((a, b) => a.end - b.end);

        return reminders;
    }

    async add(user, end, msg) {
        if (end < Date.now()) {
            throw new ReminderError("Invalid end time");
        }

        const reminder = new Reminder({ user, end, msg });

        await this.remind_db.add(reminder);

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

        return true;
    }

    async removeAll(user) {
        const res = await this.remind_db.removeAll(user);

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

        logSending(user);
        await user.send(out);
    }

    async sendReminders() {
        const t1 = Date.now(),
            reminders = await this.getPastReminders();

        if (reminders.length < 1) {
            return;
        }

        getLogger().info(`Sending ${reminders.length} reminders...`);

        for (const reminder of reminders) {
            this.sendReminder(reminder);
        }

        logTime(t1);
    }

    startSendLoop() {
        if (!this.enabled) {
            return;
        }

        const sendFunc = this.sendReminders.bind(this);
        this.sendTimer = setInterval(sendFunc, this.sendDelay);

        getLogger().info("Started reminder loop.");
    }

    stopSendLoop() {
        if (typeof this.sendTimer === "undefined") {
            return;
        }

        clearInterval(this.sendTimer);
        delete this.sendTimer;

        getLogger().info("Stopped reminder loop.");
    }

    unload() {
        this.stopSendLoop();
    }
}

export default ReminderManager;
