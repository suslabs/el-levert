import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "list",
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        let owner = msg.author.id,
            tag = msg.author.tag;

        if(args.length > 0) {
            const find = (await getClient().findUsers(args))[0].user;

            owner = find.id;
            tag = find.tag;
        }

        const reminders = await getClient().remindManager.fetch(owner);

        if(!reminders) {
            if(owner === msg.author.id) {
                return ":information_source: You have no reminders.";
            }

            return `:information_source: \`${tag}\` has no reminders.`;
        }
        
        const format = reminders.map((x, i) => {
            const date = new Date(x.end);
            let out = `${i + 1}. ${date.toLocaleDateString("en-UK")} at ${date.toLocaleTimeString("en-UK", {
                timeStyle: "short",
                timeZone: "UTC"
            })}`; 

            if(x.msg.length > 0) {
                out += `: ${x.msg}`;
            }

            return out;
        }).join("\n");

        const out = {
            ...Util.getFileAttach(format)
        };

        if(owner === msg.author.id) {
            out.content = ":information_source: Your reminders:"
        } else {
            out.content = `:information_source: \`${tag}\`'s reminders:`;
        }

        return out;
    }
}