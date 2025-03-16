import { parseDate } from "chrono-node";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const messageRegex = /(.+?)\s*(?:(?:(['"`])((?:[^\2\\]|\\.)*?)\2)|$)/;

export default {
    name: "add",
    aliases: ["set", "create"],
    parent: "reminder",
    subcommand: true,

    handler: async (args, msg) => {
        const match = args.match(messageRegex),
            date = match[1] ?? "";

        let quote = match[2],
            message = match[3] ?? "";

        if (Util.empty(args) || Util.empty(date)) {
            return ':information_source: `reminder add [date] "message"`';
        }

        if (!Util.empty(message)) {
            message = message.replaceAll("\\" + quote, quote);
        }

        const e = getClient().reminderManager.checkMessage(message);
        if (e) {
            return ":warning: " + e;
        }

        let parsedDate = parseDate(date);

        if (!parsedDate) {
            parsedDate = parseDate("in " + date);

            if (!parsedDate) {
                return `:warning: Invalid date: \`${date}\`.`;
            }
        }

        let end = new Date(parsedDate).getTime(),
            reminder;

        try {
            reminder = await getClient().reminderManager.add(msg.author.id, end, message);
        } catch (err) {
            if (err.name === "ReminderError") {
                switch (err.message) {
                    case "Invalid end time":
                        return ":warning: Can't add a reminder for a time in the past.";
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        return ":information_source: You will be reminded on " + reminder.format();
    }
};
