import { getClient } from "../../LevertClient.js";

export default {
    name: "remove_all",
    aliases: ["delete_all"],
    parent: "reminder",
    subcommand: true,

    handler: async (_, msg) => {
        const removed = await getClient().reminderManager.removeAll(msg.author.id);

        if (removed) {
            return `:information_source: Removed all reminders.`;
        } else {
            return ":information_source: You don't have any reminders.";
        }
    }
};
