import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

function formatReminders(reminders) {
    const format = reminders.map((reminder, i) => `${i + 1}. On ` + reminder.format());
    return format.join("\n");
}

export default {
    name: "list",
    aliases: ["all"],
    parent: "reminder",
    subcommand: true,
    handler: async (_, msg) => {
        const reminders = await getClient().reminderManager.list(msg.author.id);

        if (!reminders) {
            return ":information_source: You have no reminders.";
        }

        const format = formatReminders(reminders),
            embed = new EmbedBuilder().setDescription(format);

        return {
            content: ":information_source: Your Reminders:",
            embeds: [embed]
        };
    }
};
