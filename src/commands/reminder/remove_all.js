import { getClient } from "../../LevertClient.js";

export default {
    name: "remove_all",
    aliases: ["delete_all"],
    parent: "reminder",
    subcommand: true,
    handler: async (_, msg) => {
        const res = await getClient().reminderManager.removeAll(msg.author.id);

        if (!res) {
            return ":information_source: You have no reminders.";
        }

        return `:information_source: Removed all reminders.`;
    }
};
