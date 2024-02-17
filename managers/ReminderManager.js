import { time } from "discord.js";

import DBManager from "./DBManager.js";

import { getClient } from "../LevertClient.js";
import ReminderDatabase from "../database/reminder/ReminderDatabase.js";

import Reminder from "../database/reminder/Reminder.js";

class ReminderManager extends DBManager {
    constructor() {
        super("reminder", "remind_db.db", ReminderDatabase, "remind_db");

        this.owner = getClient().config.owner;
        this.maxMsgLength = 512;
    }

    checkMsg(msg) {
        if (msg.length > this.maxMsgLength) {
            return `Reminder messages can be at most ${this.maxMsgLength} characters long.`;
        } else if (msg.indexOf("\n") !== -1) {
            return "Reminder messages can only contain a single line.";
        }
    }

    fetch(user) {
        return this.remind_db.fetch(user);
    }

    add(user, end, msg) {
        const reminder = new Reminder({ user, end, msg });
        return this.remind_db.add(reminder);
    }

    async remove(user, index) {
        const reminders = await this.fetch(user);

        if (index >= reminders.length) {
            return false;
        }

        return this.remind_db.remove(reminders[index]);
    }

    async removeAll(user) {
        return await this.remind_db.removeAll(user);
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

    async sendReminders() {
        const reminders = await this.checkPast();

        for (const reminder of reminders) {
            this.sendReminder(reminder);
        }
    }

    async sendReminder(reminder) {
        const user = await getClient().findUserById(reminder.user);

        if (!user) {
            return false;
        }

        const timestamp = Math.floor(reminder.end / 1000);
        let out = `You set a reminder for ${time(timestamp, "f")}`;

        if (reminder.msg.length > 0) {
            out += ` with the message: **${reminder.msg}**`;
        } else {
            out += ".";
        }

        await user.send(out);
    }
}

export default ReminderManager;
