import { getClient } from "../../../LevertClient.js";

export default {
    name: "remove_all",
    parent: "reminder",
    subcommand: true,
    handler: async (_, msg) => {
        const reminders = await getClient().reminderManager.fetch(msg.author.id);

        if (typeof reminders === "undefined") {
            return ":information_source: You have no reminders.";
        }

        await getClient().reminderManager.removeAll(msg.author.id);

        return `:information_source: Removed all reminders.`;
    }
};
