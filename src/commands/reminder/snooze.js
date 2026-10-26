import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DateUtil from "../../util/commands/DateUtil.js";
import SnoozeUtil from "../../util/commands/SnoozeUtil.js";

class ReminderSnoozeCommand {
    static info = {
        name: "snooze",
        aliases: ["delay"],
        parent: "reminder",
        subcommand: true,
        args: "[index] <duration>",
        description:
            "Snooze an active reminder or delay the last received reminder by a specified duration (e.g. 5m, 15m, 1h).",
        usage: "- [index]: Optional numerical index (1-based) of the reminder to snooze.\n- <duration>: Duration to delay the reminder by (e.g. 10m, 1h, 2d).",
        parser: {
            requireArgs: true
        }
    };

    async handler(ctx) {
        const rawArgs = ctx.argsText.trim();

        if (Util.empty(rawArgs)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        const parts = rawArgs.split(/\s+/),
            firstPart = Util.first(parts);

        let index = null,
            durationText = rawArgs;

        if (/^\d+$/.test(firstPart) && Util.multiple(parts)) {
            index = Util.parseInt(firstPart) - 1;
            durationText = parts.slice(1).join(" ");
        }

        if (Util.empty(durationText)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        const duration = DateUtil.parseInterval(durationText);

        if (duration === null || duration <= 0) {
            return `${getEmoji("warn")} Invalid duration: \`${durationText}\`.`;
        }

        let reminder;

        try {
            reminder = await getClient().reminderManager.snooze(ctx.msg.author.id, index, duration);
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "No reminders to snooze":
                    return `${getEmoji("warn")} You don't have any reminders to snooze.`;
                case "Reminder doesn't exist": {
                    const indexText = index !== null ? `**${index + 1}** ` : "";
                    return `${getEmoji("warn")} Reminder ${indexText}doesn't exist.`;
                }
                case "Invalid reminder index":
                    return `${getEmoji("warn")} Invalid reminder index: **${index + 1}**.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        const format = reminder.format(false);
        return `${getEmoji("info")} Reminder snoozed until ${format}.`;
    }

    async interactionHandler(ctx) {
        return await SnoozeUtil.handleInteraction(ctx);
    }
}

export default ReminderSnoozeCommand;
