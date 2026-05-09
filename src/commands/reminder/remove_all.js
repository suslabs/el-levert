import { getClient, getEmoji } from "../../LevertClient.js";

class ReminderRemoveAllCommand {
    static info = {
        name: "remove_all",
        aliases: ["delete_all"],
        parent: "reminder",
        subcommand: true
    };

    async handler(ctx) {
        const removed = await getClient().reminderManager.removeAll(ctx.msg.author.id);

        if (removed) {
            return `${getEmoji("info")} Removed all reminders.`;
        }

        return `${getEmoji("info")} You don't have any reminders.`;
    }
}

export default ReminderRemoveAllCommand;
