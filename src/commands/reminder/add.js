import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DateUtil from "../../util/commands/DateUtil.js";

const messageRegex = /(.+?)\s*(?:(?:(['"`])((?:[^\2\\]|\\.)*?)\2)|$)/;

class ReminderAddCommand {
    static info = {
        name: "add",
        aliases: ["set", "create"],
        parent: "reminder",
        subcommand: true,
        args: '<date> ["message"]',
        description:
            "Create a scheduled reminder. The date can be a relative duration (e.g. 10m, 2h, 3d) or a timestamp.",
        usage: '- <date>: When to trigger the reminder (e.g. 1h, 30m, 2026-12-01).\n- ["message"]: Optional message text enclosed in quotes.',
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "date",
                reader: {
                    kind: "match",
                    pattern: messageRegex,
                    index: 1
                }
            },
            {
                name: "quote",
                reader: {
                    kind: "match",
                    pattern: messageRegex,
                    index: 2
                }
            },
            {
                name: "message",
                reader: {
                    kind: "match",
                    pattern: messageRegex,
                    index: 3
                }
            }
        ]
    };

    async handler(ctx) {
        const date = ctx.arg("date");

        if (Util.empty(date)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        const parsedDate = DateUtil.parse(date);

        if (parsedDate === null) {
            return `${getEmoji("warn")} Invalid date: \`${date}\`.`;
        }

        let message = ctx.arg("message"),
            quote = ctx.arg("quote");

        if (typeof message === "string" && typeof quote === "string") {
            message = message.replaceAll("\\" + quote, quote);
        }

        {
            let err;
            [message, err] = getClient().reminderManager.checkMessage(message, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let reminder;

        try {
            reminder = await getClient().reminderManager.add(ctx.msg.author.id, parsedDate, message, false);
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Invalid end time":
                    return `${getEmoji("warn")} Can't add a reminder for a time in the past.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        const format = reminder.format();
        return `${getEmoji("info")} You will be reminded on ${format}${format.endsWith('"') ? "" : "."}`;
    }
}

export default ReminderAddCommand;
