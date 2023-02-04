import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "list",
    parent: "reminder",
    subcommand: true,
    handler: async (_, msg) => {
        if(!getClient().config.enableReminders) {
            return ":warning: Reminders are disabled.";
        }

        const reminders = await getClient().remindManager.fetch(msg.author.id);

        if(!reminders) {
            return ":information_source: You have no reminders.";
        }
        
        const format = reminders.map((x, i) => {
            const date = new Date(x.end);
            let out = `${i + 1}. ${date.toLocaleDateString("en-UK")} at ${date.toLocaleTimeString("en-UK", {
                timeStyle: "short"
            })}`; 

            if(x.msg.length > 0) {
                out += `: ${x.msg}`;
            }

            return out;
        }).join("\n");

        return {
            content: `:information_source: Your reminders:`,
            ...Util.getFileAttach(format)
        };
    }
}