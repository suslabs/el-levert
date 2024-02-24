import * as chrono from "chrono-node";

import { getClient } from "../../../LevertClient.js";

export default {
    name: "add",
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        const match = args.match(/(.+?)\s*(?:(?:"((?:[^"\\]|\\.)*)")|$)/),
            date = match[1] ?? "",
            message = match[2] ?? "";

        if (args.length === 0 || date.length === 0) {
            return ':information_source: `reminder add [date] "message"`';
        }

        const e = getClient().reminderManager.checkMessage(message);
        if (e) {
            return ":warning: " + e;
        }

        let parsedDate = chrono.parseDate(date),
            end;

        if (!parsedDate) {
            parsedDate = chrono.parseDate("in " + date);

            if (!parsedDate) {
                return `:warning: Invalid date: \`${date}\`.`;
            }
        } else {
            end = new Date(parsedDate).getTime();
        }

        const reminder = await getClient().reminderManager.add(msg.author.id, end, message);

        return `:information_source: You will be reminded on ${reminder.getTimestamp()}.`;
    }
};
