import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import ReminderManager from "../../managers/database/ReminderManager.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatReminders(reminders, startIndex = 0, discord = true) {
    return reminders.map((reminder, i) => `${startIndex + i + 1}. On ${reminder.format(true, discord)}`).join("\n");
}

class ReminderListCommand {
    static defaultLimit = ReminderManager.defaultListLimit;

    static info = {
        name: "list",
        aliases: ["all"],
        parent: "reminder",
        subcommand: true,
        args: "[--page <num>] [--limit <num>] [--all]",
        description: "List all active scheduled reminders for your account.",
        arguments: [...PaginationUtil.getPaginationArguments({ defaultLimit: ReminderListCommand.defaultLimit })]
    };

    async handler(ctx) {
        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: ReminderListCommand.defaultLimit
        });

        if (paginationOpts.all) {
            const { items: allReminders } = await getClient().reminderManager.list(
                { user: ctx.msg.author.id },
                { all: true }
            );

            if (Util.empty(allReminders)) {
                return `${getEmoji("info")} You have **no** reminders.`;
            }

            const header = `${getEmoji("info")} Your reminders:`;

            return await PaginationUtil.paginate(ctx, {
                items: allReminders,
                defaultLimit: ReminderListCommand.defaultLimit,

                render: (items, { page }) => {
                    const startIndex = (page - 1) * ctx.pageSize,
                        format = formatReminders(items, startIndex, true);

                    return {
                        content: header,
                        embeds: [new EmbedBuilder().setDescription(format)]
                    };
                },

                dumpHeader: header,
                formatDump: (items, discord = true) => formatReminders(items, 0, discord),
                filename: "reminders.txt"
            });
        }

        const initialRes = await getClient().reminderManager.list({ user: ctx.msg.author.id }, paginationOpts);

        if (initialRes.totalCount === 0) {
            return `${getEmoji("info")} You have **no** reminders.`;
        }

        const header = `${getEmoji("info")} Your reminders:`;

        return await PaginationUtil.paginate(ctx, {
            initialData: {
                items: initialRes.items,
                totalCount: initialRes.totalCount,
                page: paginationOpts.page ?? 1
            },
            defaultLimit: ReminderListCommand.defaultLimit,

            fetch: async ({ page, limit, offset }) => {
                return await getClient().reminderManager.list({ user: ctx.msg.author.id }, { page, limit, offset });
            },

            render: (items, { page }) => {
                const startIndex = (page - 1) * ctx.pageSize,
                    format = formatReminders(items, startIndex, true);

                return {
                    content: header,
                    embeds: [new EmbedBuilder().setDescription(format)]
                };
            },

            dumpHeader: header,
            formatDump: async (items, discord = true) => {
                const { items: allReminders } = await getClient().reminderManager.list(
                    { user: ctx.msg.author.id },
                    { all: true }
                );
                return formatReminders(allReminders, 0, discord);
            },
            filename: "reminders.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default ReminderListCommand;
