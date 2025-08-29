import { parseDate } from "chrono-node";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const messageRegex = /(.+?)\s*(?:(?:(['"`])((?:[^\2\\]|\\.)*?)\2)|$)/;

export default {
    name: "add",
    aliases: ["set", "create"],
    parent: "reminder",
    subcommand: true,

    handler: async function (args, msg) {
        const match = args.match(messageRegex),
            date = match?.[1];

        if (Util.empty(args) || Util.empty(date)) {
            return `:information_source: ${this.getArgsHelp('date "message"')}`;
        }

        let parsedDate = parseDate(date);

        if (!parsedDate) {
            parsedDate = parseDate(`in ${date}`);
            if (!parsedDate) {
                return `:warning: Invalid date: \`${date}\`.`;
            }
        }

        let [quote, message] = Util.after(match, 1);
        message = message.replaceAll("\\" + quote, quote);

        {
            let err;
            [message, err] = getClient().reminderManager.checkMessage(message, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        let end = new Date(parsedDate).getTime(),
            reminder;

        try {
            reminder = await getClient().reminderManager.add(msg.author.id, end, message, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Invalid end time":
                    return ":warning: Can't add a reminder for a time in the past.";
                default:
                    return `:warning: ${err.message}.`;
            }
        }

        const format = reminder.format();
        return `:information_source: You will be reminded on ${format}${format.endsWith('"') ? "" : "."}`;
    }
};
