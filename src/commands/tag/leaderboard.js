import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";
import { validLeaderboardTypes } from "../../util/commands/LeaderboardTypes.js";

function formatLeaderboard(leaderboard, type, startIndex = 0, discord = true) {
    return leaderboard
        .map((entry, i) => {
            const index = `${startIndex + i + 1}. `;

            const name = type === "usage" ? `${entry.name}${entry.exists ? "" : "*"}` : entry.user.username;

            const label = discord ? `\`${name}\`: ` : `${name}: `;

            let value;

            switch (type) {
                case "count":
                    const countNum = Util.formatNumber(entry.count),
                        countSuffix = ` tag${entry.count > 1 ? "s" : ""}`;

                    value = (discord ? `**${countNum}**` : countNum) + countSuffix;
                    break;
                case "size":
                    const quotaNum = Util.formatNumber(entry.quota, 2);

                    value = (discord ? `**${quotaNum}**` : quotaNum) + " kb";
                    break;
                case "usage":
                    const useNum = Util.formatNumber(entry.count),
                        useSuffix = ` use${entry.count > 1 ? "s" : ""}`;

                    value = (discord ? `**${useNum}**` : useNum) + useSuffix;
                    break;
            }

            return `${index}${label}${value}`;
        })
        .join("\n");
}

class TagLeaderboardCommand {
    static defaultLimit = 10;
    static maxLimit = 50;
    static dumpLimit = 1000;

    static info = {
        name: "leaderboard",
        aliases: ["lb"],
        parent: "tag",
        subcommand: true,
        args: "<count|size|usage> [limit] [--page <num>] [--limit <num>] [--all]",
        description:
            "Show rankings for tags by count of tags owned per user, total storage size consumed in KB, or execution usage count.",
        usage: "- <count|size|usage>: Ranking metric to display.\n- [limit]: Number of leaderboard entries to show (max 50).",
        parser: {
            requireArgs: true
        },
        arguments: [
            ...PaginationUtil.getPaginationArguments({
                defaultLimit: TagLeaderboardCommand.defaultLimit,
                maxLimit: TagLeaderboardCommand.maxLimit
            }),
            {
                name: "leaderboardType",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "limitText",
                kind: "positional",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        const l_type = ctx.arg("leaderboardType"),
            l_text = ctx.arg("limitText");

        if (!validLeaderboardTypes.has(l_type)) {
            return `${getEmoji("warn")} Invalid leaderboard type.`;
        }

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: TagLeaderboardCommand.defaultLimit,
            maxLimit: TagLeaderboardCommand.maxLimit
        });

        let fetchLimit = TagLeaderboardCommand.maxLimit;

        if (paginationOpts.all) {
            fetchLimit = TagLeaderboardCommand.dumpLimit;
        } else if (!Util.empty(l_text)) {
            const parsedLimit = Util.parseInt(l_text);

            if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
                return `${getEmoji("warn")} Invalid limit: ${l_text}`;
            }

            fetchLimit = Util.clamp(parsedLimit, 1, TagLeaderboardCommand.maxLimit);
        }

        const leaderboard = await getClient().tagManager.leaderboard(l_type, fetchLimit, false);

        if (Util.empty(leaderboard)) {
            return `${getEmoji("info")} There are **no** tags registered.`;
        }

        const header = `${getEmoji("info")} Tag ${l_type} leaderboard:`;

        return await PaginationUtil.paginate(ctx, {
            items: leaderboard,
            defaultLimit: TagLeaderboardCommand.defaultLimit,

            render: async (items, { page }) => {
                await getClient().tagManager.resolveLeaderboardUsers(items, l_type);

                const startIndex = (page - 1) * ctx.pageSize,
                    desc = formatLeaderboard(items, l_type, startIndex, true);

                return {
                    content: header,
                    embeds: [new EmbedBuilder().setDescription(desc)]
                };
            },

            dumpHeader: header,
            formatDump: async (items, discord = true) => {
                await getClient().tagManager.resolveLeaderboardUsers(items, l_type);
                return formatLeaderboard(items, l_type, 0, discord);
            },
            filename: `leaderboard_${l_type}.txt`
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagLeaderboardCommand;
