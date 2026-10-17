import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatReminders(reminders, startIndex = 0, discord = true) {
    return reminders.map((reminder, i) => `${startIndex + i + 1}. On ${reminder.format(discord)}`).join("\n");
}

class ReminderListCommand {
    static info = {
        name: "list",
        aliases: ["all"],
        parent: "reminder",
        subcommand: true,
        args: "[--page <num>] [--limit <num>] [--all]",
        description: "List all active scheduled reminders for your account.",
        arguments: [...PaginationUtil.getPaginationArguments({ defaultLimit: 5 })]
    };

    async handler(ctx) {
        const reminders = await getClient().reminderManager.list(ctx.msg.author.id);

        if (Util.empty(reminders)) {
            return `${getEmoji("info")} You have **no** reminders.`;
        }

        return await PaginationUtil.paginate(ctx, {
            items: reminders,
            defaultLimit: 5,
            render: (items, { page }) => {
                const startIndex = (page - 1) * ctx.pageSize,
                    format = formatReminders(items, startIndex, true);

                return {
                    content: `${getEmoji("info")} Your reminders:`,
                    embeds: [new EmbedBuilder().setDescription(format)]
                };
            },
            dumpHeader: `${getEmoji("info")} Your reminders:`,
            formatDump: (items, discord = true) => formatReminders(items, 0, discord),
            filename: "reminders.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default ReminderListCommand;
