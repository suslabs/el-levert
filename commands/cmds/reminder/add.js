import * as chrono from "chrono-node";

import { getClient } from "../../../LevertClient.js";

export default {
    name: "add",
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        const match = args.match(/(.+?)\s*(?:(?:"((?:[^"\\]|\\.)*)")|$)/),
              date = match[1] ?? "",
              remindMsg = match[2] ?? "",
              e = getClient().remindManager.checkMsg(remindMsg);

        if(args.length === 0 || date.length === 0) {
            return ":information_source: `reminder add [date] \"message\"`";
        }      

        if(e) {
            return ":warning: " + e;
        }

        let parsed = chrono.parseDate(date);

        if(!parsed) {
            parsed = chrono.parseDate("in " + date);

            if(!parsed) {
                return `:warning: Invalid date: \`${date}\`.`;
            }
        }

        const end = new Date(parsed).getTime();
        await getClient().remindManager.add(msg.author.id, end, remindMsg);

        return `:information_source: You will be reminded on <t:${Math.floor(end / 1000)}:f>.`;
    }
}