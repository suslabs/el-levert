import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DateUtil from "../../util/commands/DateUtil.js";

class ReminderEditCommand {
    static minInterval = Util.durationSeconds.minute / Util.durationSeconds.milli;

    static info = {
        name: "edit",
        aliases: ["change", "modify"],
        parent: "reminder",
        subcommand: true,
        args: "<index> [date] [--every <interval>] [--clear-every]",
        description: "Edit an existing reminder's trigger time or recurrence interval by its 1-based list index.",
        usage: "- <index>: Numerical index (1-based) of the reminder to edit.\n- [date]: New date or relative duration to trigger the reminder.\n- --every, --interval, -e <interval>: Update recurrence interval for repeated reminders.\n- --clear-every, --clear-interval: Remove recurrence and make the reminder one-time.",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "every",
                kind: "option",
                aliases: ["interval", "repeat", "recurring"],
                shorthand: "e"
            },
            {
                name: "clearEvery",
                kind: "option",
                type: "boolean",
                aliases: ["clear-every", "clear-interval", "once"]
            },
            {
                name: "index",
                kind: "positional",
                index: 0,
                type: "integer",
                required: true,
                valid: {
                    min: 1
                }
            },
            {
                name: "date",
                kind: "rest"
            }
        ]
    };

    async handler(ctx) {
        const idxRes = ctx.arg("index", { validate: true });

        if (!idxRes.valid) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        const index = idxRes.value,
            dbIdx = index - 1;

        const date = ctx.arg("date"),
            every = ctx.arg("every"),
            clearEvery = ctx.arg("clearEvery") ?? false;

        if (Util.empty(date) && Util.empty(every) && !clearEvery) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        let end = null,
            interval;

        if (clearEvery) {
            interval = null;
        } else if (Util.nonemptyString(every)) {
            interval = DateUtil.parseInterval(every);

            if (interval === null) {
                return `${getEmoji("warn")} Invalid recurring interval: \`${every}\`.`;
            }
        }

        if (Util.nonemptyString(date)) {
            const parsed = DateUtil.parseDateRecurring(date, every);

            if (parsed === null) {
                return `${getEmoji("warn")} Invalid date: \`${date}\`.`;
            }

            end = parsed.date;

            if (parsed.isRecurring && !clearEvery) {
                interval = parsed.interval;
            }
        }

        if (interval != null && interval < ReminderEditCommand.minInterval) {
            const minInterval = Util.duration(ReminderEditCommand.minInterval, { format: true });
            return `${getEmoji("warn")} Repeat interval must be at least ${minInterval}.`;
        }

        let reminder;

        try {
            reminder = await getClient().reminderManager.edit(ctx.msg.author.id, dbIdx, end, interval);
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Reminder doesn't exist":
                    return `${getEmoji("warn")} Reminder **${index}** doesn't exist.`;
                case "Invalid end time":
                    return `${getEmoji("warn")} Can't set a reminder for a time in the past.`;
                case "Invalid reminder interval":
                    return `${getEmoji("warn")} Invalid recurring interval.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        const format = reminder.format();
        return `${getEmoji("info")} Updated reminder **${index}**: ${format}`;
    }
}

export default ReminderEditCommand;
