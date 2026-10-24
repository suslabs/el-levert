import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import PermissionManager from "../../managers/database/PermissionManager.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatGroups(groups, startIndex = 0, discord = true) {
    const dot = discord ? "\\. " : ". ",
        format = groups.map((group, i) => `${startIndex + i + 1}${dot}${group.formatUsers(true, discord)}`);

    return format.join("\n");
}

class PermListCommand {
    static defaultLimit = PermissionManager.defaultGroupLimit;
    static maxLimit = 50;

    static info = {
        name: "list",
        parent: "perm",
        subcommand: true,
        args: "[--page <num>] [--limit <num>] [--all]",
        description: "List all registered permission groups, their permission levels, and member users.",
        arguments: PaginationUtil.getPaginationArguments({
            defaultLimit: PermListCommand.defaultLimit,
            maxLimit: PermListCommand.maxLimit
        })
    };

    async handler(ctx) {
        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: PermListCommand.defaultLimit,
            maxLimit: PermListCommand.maxLimit
        });

        if (paginationOpts.all) {
            const allRes = await getClient().permManager.listGroups({ fetchUsernames: true }, { all: true });

            if (allRes === null || Util.empty(allRes.items)) {
                return `${getEmoji("info")} **No** permissions are registered.`;
            }

            const allGroups = allRes.items;

            const header = `${getEmoji("info")} Registered permissions:`;

            return await PaginationUtil.paginate(ctx, {
                items: allGroups,
                defaultLimit: PermListCommand.defaultLimit,

                render: (items, { page }) => {
                    const startIndex = (page - 1) * ctx.pageSize,
                        format = formatGroups(items, startIndex, true);

                    return {
                        content: header,
                        embeds: [new EmbedBuilder().setDescription(format)]
                    };
                },

                dumpHeader: header,
                formatDump: (items, discord = true) => formatGroups(items, 0, discord),
                filename: "permissions.txt"
            });
        }

        const initialRes = await getClient().permManager.listGroups({ fetchUsernames: true }, paginationOpts);

        if (initialRes === null || initialRes.totalCount === 0) {
            return `${getEmoji("info")} **No** permissions are registered.`;
        }

        const header = `${getEmoji("info")} Registered permissions:`;

        return await PaginationUtil.paginate(ctx, {
            initialData: {
                items: initialRes.items,
                totalCount: initialRes.totalCount,
                page: paginationOpts.page ?? 1
            },
            defaultLimit: PermListCommand.defaultLimit,
            maxLimit: PermListCommand.maxLimit,

            fetch: async ({ page, limit, offset }) => {
                return await getClient().permManager.listGroups({ fetchUsernames: true }, { page, limit, offset });
            },

            render: (items, { page }) => {
                const startIndex = (page - 1) * ctx.pageSize,
                    format = formatGroups(items, startIndex, true);

                return {
                    content: header,
                    embeds: [new EmbedBuilder().setDescription(format)]
                };
            },

            dumpHeader: header,
            formatDump: async (items, discord = true) => {
                const { items: allGroups } = await getClient().permManager.listGroups(
                    { fetchUsernames: true },
                    { all: true }
                );
                return formatGroups(allGroups, 0, discord);
            },
            filename: "permissions.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default PermListCommand;
