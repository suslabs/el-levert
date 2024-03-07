import { getClient } from "../../LevertClient.js";

export default {
    name: "remove",
    aliases: ["delete"],
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        const index = parseInt(args);

        if (args.length <= 0 || isNaN(index)) {
            return ":information_source: `reminder remove [index]`";
        }

        const res = await getClient().reminderManager.remove(msg.author.id, index - 1);

        if (!res) {
            return `:warning: Reminder **${index}** doesn't exist.`;
        }

        return `:information_source: Removed reminder **${index}**.`;
    }
};
