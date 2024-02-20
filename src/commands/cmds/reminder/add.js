import * as chrono from "chrono-node";
import { time } from "discord.js";

import { getClient } from "../../../LevertClient.js";

export default {
    name: "add",
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        const match = args.match(/(.+?)\s*(?:(?:"((?:[^"\\]|\\.)*)")|$)/),
            date = match[1] ?? "",
            remindMsg = match[2] ?? "";

        if (args.length === 0 || date.length === 0) {
            return ':information_source: `reminder add [date] "message"`';
        }

        const e = getClient().remindManager.checkMsg(remindMsg);
        if (e) {
            return ":warning: " + e;
        }

        let parsed = chrono.parseDate(date);
        if (!parsed) {
            parsed = chrono.parseDate("in " + date);

            if (!parsed) {
                return `:warning: Invalid date: \`${date}\`.`;
            }
        }

        const end = new Date(parsed).getTime();
        await getClient().remindManager.add(msg.author.id, end, remindMsg);

        const timestamp = Math.floor(end / 1000);
        return `:information_source: You will be reminded on ${time(timestamp, "f")}.`;
    }
};
