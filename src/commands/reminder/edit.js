import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DateUtil from "../../util/commands/DateUtil.js";

class ReminderEditCommand {
    static info = {
        name: "edit",
        aliases: ["change", "modify"],
        parent: "reminder",
        subcommand: true,
        args: "<index> [date] [--every <interval>] [--clear-every] [--clear-end]",
        description:
            "Edit an existing reminder's start time, recurrence interval, or end time by its 1-based list index.",
        usage: "- <index>: Numerical index (1-based) of the reminder to edit.\n- [date]: New start date or relative duration. Add `for <duration>` or `until <date>` to set the recurrence end.\n- --every, --interval, -e <interval>: Update recurrence interval.\n- --clear-every, --clear-interval: Remove recurrence.\n- --clear-end: Let the recurrence continue indefinitely.",
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
                name: "clearEnd",
                kind: "option",
                type: "boolean",
                aliases: ["clear-end"]
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
            clearEvery = ctx.arg("clearEvery") ?? false,
            clearEnd = ctx.arg("clearEnd") ?? false;

        if (Util.empty(date) && Util.empty(every) && !clearEvery && !clearEnd) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        let start = null,
            interval,
            end;

        if (clearEvery) {
            interval = null;
            end = null;
        } else if (Util.nonemptyString(every)) {
            interval = DateUtil.parseInterval(every, true);

            if (interval === null) {
                return `${getEmoji("warn")} Invalid recurring interval: \`${every}\`.`;
            }
        }

        if (Util.nonemptyString(date)) {
            const parsed = DateUtil.parseDateRecurring(date, every);

            if (parsed === null) {
                return `${getEmoji("warn")} Invalid date: \`${date}\`.`;
            }

            start = parsed.date;

            if (parsed.isRecurring && !clearEvery) {
                interval = parsed.interval;
                end = parsed.end;
            }
        }

        if (clearEnd) {
            end = null;
        }

        const intervalError = this.parentCmd.checkInterval(interval);

        if (intervalError !== null) {
            return intervalError;
        }

        let reminder;

        try {
            reminder = await getClient().reminderManager.edit(ctx.msg.author.id, dbIdx, start, interval, true, end);
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Reminder doesn't exist":
                    return `${getEmoji("warn")} Reminder **${index}** doesn't exist.`;
                case "Invalid start time":
                    return `${getEmoji("warn")} Can't set a reminder for a time in the past.`;
                case "Invalid reminder interval":
                    return `${getEmoji("warn")} Invalid recurring interval.`;
                case "Invalid reminder end time":
                    return `${getEmoji("warn")} The repeat end must be on or after the first reminder.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        const format = reminder.format();
        return `${getEmoji("info")} Updated reminder **${index}**: ${format}`;
    }
}

export default ReminderEditCommand;
