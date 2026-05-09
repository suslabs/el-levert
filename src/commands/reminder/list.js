import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

function formatReminders(reminders) {
    const format = reminders.map((reminder, i) => `${i + 1}. On ` + reminder.format());
    return format.join("\n");
}

class ReminderListCommand {
    static info = {
        name: "list",
        aliases: ["all"],
        parent: "reminder",
        subcommand: true
    };

    async handler(ctx) {
        const reminders = await getClient().reminderManager.list(ctx.msg.author.id);

        if (reminders === null) {
            return `${getEmoji("info")} You have **no** reminders.`;
        }

        const format = formatReminders(reminders),
            embed = new EmbedBuilder().setDescription(format);

        return {
            content: `${getEmoji("info")} Your reminders:`,
            embeds: [embed]
        };
    }
}

export default ReminderListCommand;
