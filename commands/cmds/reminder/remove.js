import { getClient } from "../../../LevertClient.js";

export default {
    name: "remove",
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        const ind = parseInt(args);

        if(args.length === 0 || isNaN(ind) || ind !== Math.floor(ind)) {
            return ":information_source: `reminder remove [index]`";
        }      

        if(!await getClient().remindManager.remove(msg.author.id, ind - 1)) {
            return `:warning: Reminder **${ind}** doesn't exist.`;
        }

        return `:information_source: Removed reminder **${ind}**`;
    }
}