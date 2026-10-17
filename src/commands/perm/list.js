import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatGroups(groups, startIndex = 0, discord = true) {
    const dot = discord ? "\\. " : ". ",
        format = groups.map((group, i) => `${startIndex + i + 1}${dot}${group.formatUsers(true, discord)}`);

    return format.join("\n");
}

class PermListCommand {
    static info = {
        name: "list",
        parent: "perm",
        subcommand: true,
        args: "[--page <num>] [--limit <num>] [--all]",
        description: "List all registered permission groups, their permission levels, and member users.",
        arguments: PaginationUtil.getPaginationArguments({ defaultLimit: 10, maxLimit: 50 })
    };

    async handler(ctx) {
        const groups = await getClient().permManager.listGroups(true);

        if (Util.empty(groups)) {
            return `${getEmoji("info")} **No** permissions are registered.`;
        }

        const header = `${getEmoji("info")} Registered permissions:`;

        return await PaginationUtil.paginate(ctx, {
            items: groups,
            defaultLimit: 10,
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

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default PermListCommand;
