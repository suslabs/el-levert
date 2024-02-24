import DBManager from "./DBManager.js";

import { getClient, getLogger } from "../../LevertClient.js";
import ReminderDatabase from "../../database/ReminderDatabase.js";

import Reminder from "../../structures/Reminder.js";

const sendDelay = 1000;

class ReminderManager extends DBManager {
    constructor(enabled = true) {
        super(enabled, "reminder", ReminderDatabase, "remind_db");

        this.maxMsgLength = 512;
    }

    checkMessage(msg) {
        if (msg.length > this.maxMsgLength) {
            return `Reminder messages can be at most ${this.maxMsgLength} characters long.`;
        } else if (msg.indexOf("\n") !== -1) {
            return "Reminder messages can only contain a single line.";
        }
    }

    async fetch(user) {
        return await this.remind_db.fetch(user);
    }

    async add(user, end, msg) {
        const reminder = new Reminder({ user, end, msg });

        await this.remind_db.add(reminder);
        return reminder;
    }

    async remove(user, index) {
        const reminders = await this.fetch(user);

        if (typeof reminders === "undefined" || typeof reminders[user] === "undefined") {
            return false;
        }

        await this.remind_db.remove(reminders[index]);
        return true;
    }

    async removeAll(user) {
        const res = await this.remind_db.removeAll(user);
        return res.changes > 0;
    }

    async checkPast(date) {
        date = date ?? Date.now();

        const reminders = await this.remind_db.list(),
            past = reminders.filter(x => x.end < date);

        for (const reminder of past) {
            await this.remind_db.remove(reminder);
        }

        return past;
    }

    async sendReminder(reminder) {
        const user = await getClient().findUserById(reminder.user);

        if (!user) {
            return false;
        }

        let out = `You set a reminder for ${reminder.getTimestamp()}`;

        if (reminder.msg.length > 0) {
            out += ` with the message: **${reminder.msg}**`;
        } else {
            out += ".";
        }

        await user.send(out);
    }

    async sendReminders() {
        const reminders = await this.checkPast();

        for (const reminder of reminders) {
            this.sendReminder(reminder);
        }
    }

    setSendInterval() {
        if (!this.enabled) {
            return;
        }

        const sendFunc = this.sendReminders.bind(this);
        this.sendInterval = setInterval(sendFunc, sendDelay);

        getLogger().info("Started reminder loop.");
    }

    clearSendInterval() {
        if (typeof this.sendInterval === "undefined") {
            return;
        }

        clearInterval(this.sendInterval);
        delete this.sendInterval;

        getLogger().info("Stopped reminder loop.");
    }
}

export default ReminderManager;
