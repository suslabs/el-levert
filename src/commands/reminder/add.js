import { parseDate } from "chrono-node";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const messageRegex = /(.+?)\s*(?:(?:(['"`])((?:[^\2\\]|\\.)*?)\2)|$)/;

class ReminderAddCommand {
    static info = {
        name: "add",
        aliases: ["set", "create"],
        parent: "reminder",
        subcommand: true,
        arguments: [
            {
                name: "date",
                parser: "match",
                regex: messageRegex,
                index: 1
            },
            {
                name: "quote",
                parser: "match",
                regex: messageRegex,
                index: 2
            },
            {
                name: "message",
                parser: "match",
                regex: messageRegex,
                index: 3,
                transform: (value, _context, parsed) =>
                    typeof value === "string" && typeof parsed.quote === "string"
                        ? value.replaceAll("\\" + parsed.quote, parsed.quote)
                        : value
            }
        ]
    };

    async handler(ctx) {
        const date = ctx.arg("date");

        if (Util.empty(ctx.argsText) || Util.empty(date)) {
            return `${getEmoji("info")} ${this.getArgsHelp('date "message"')}`;
        }

        let parsedDate = parseDate(date);

        if (!parsedDate) {
            parsedDate = parseDate(`in ${date}`);
            if (!parsedDate) {
                return `${getEmoji("warn")} Invalid date: \`${date}\`.`;
            }
        }

        let message = ctx.arg("message");

        {
            let err;
            [message, err] = getClient().reminderManager.checkMessage(message, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let reminder;

        try {
            reminder = await getClient().reminderManager.add(ctx.msg.author.id, new Date(parsedDate).getTime(), message, false);
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
