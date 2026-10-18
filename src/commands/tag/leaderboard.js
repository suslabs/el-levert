import { EmbedBuilder } from "discord.js";

import PositionalCommandReader from "../../parsers/command/reader/PositionalCommandReader.js";

import { validLeaderboardTypes } from "../../util/commands/LeaderboardTypes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatLeaderboard(leaderboard, type, startIndex = 0, discord = true) {
    return leaderboard
        .map((entry, i) => {
            const index = `${startIndex + i + 1}. `;

            const name =
                type === "uses" || type === "usage" ? `${entry.name}${entry.exists ? "" : "*"}` : entry.user.username;

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
                case "uses":
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

function formatUserTags(tags, startIndex = 0, discord = true) {
    return tags
        .map((tag, i) => {
            const index = `${startIndex + i + 1}. `,
                name = discord ? `\`${tag.name}\`: ` : `${tag.name}: `,
                useNum = Util.formatNumber(tag.uses),
                useSuffix = ` use${tag.uses === 1 ? "" : "s"}`;

            return `${index}${name}${discord ? `**${useNum}**` : useNum}${useSuffix}`;
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
        args: "<count|size|uses|user> [user|limit] [mode] [--page <num>] [--limit <num>] [--all]",
        description:
            "Show rankings for tags by count of tags owned per user, total storage size consumed in KB, tags that have been used, or leaderboard positions for a user.",
        usage: "- <count|size|uses|user>: Ranking metric to display, or 'user' for user leaderboard.\n- [user|limit]: User name/mention for user or uses mode (defaults to yourself), or number of entries to show (max 50).\n- [mode]: 'uses' to view tag usage rankings for that user.",
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

        const [part1, part2] = PositionalCommandReader.split(l_text);

        let isUserMode = false,
            showUsage = false;

        let userQuery;

        if (l_type === "user") {
            isUserMode = true;

            if (part1 === "uses" || part1 === "usage") {
                userQuery = part2;
                showUsage = true;
            } else {
                userQuery = part1;
                showUsage = part2 === "uses" || part2 === "usage";
            }
        } else if (!validLeaderboardTypes.has(l_type)) {
            isUserMode = true;
            userQuery = l_type;
            showUsage = part1 === "uses" || part1 === "usage";
        } else if (l_type === "uses" || l_type === "usage") {
            if (part1 === "user") {
                isUserMode = true;
                userQuery = part2;
                showUsage = true;
            } else if (!Util.empty(part1)) {
                const parsedLimit = Util.parseInt(part1);

                if (Number.isNaN(parsedLimit)) {
                    isUserMode = true;
                    userQuery = part1;
                    showUsage = true;
                }
            }
        }

        if (isUserMode) {
            let user = ctx.msg.author;

            if (!Util.empty(userQuery)) {
                const find = Util.first(await getClient().findUsers(userQuery));

                user = find?.user ?? {
                    id: userQuery,
                    username: userQuery
                };
            }

            const isSelf = user === ctx.msg.author || user.id === ctx.msg.author.id,
                userLabel = isSelf ? "Your" : `User \`${user.username}\`'s`;

            if (showUsage) {
                const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
                    defaultLimit: TagLeaderboardCommand.defaultLimit,
                    maxLimit: TagLeaderboardCommand.maxLimit
                });

                const fetchLimit = paginationOpts.all
                    ? TagLeaderboardCommand.dumpLimit
                    : TagLeaderboardCommand.maxLimit;

                const stats = await getClient().tagManager.userLeaderboard(user.id, fetchLimit);

                if (stats === null) {
                    return `${getEmoji("info")} ${isSelf ? "You have" : `User \`${user.username}\` has`} **no** tags.`;
                }

                const usageTags = stats.tags.filter(tag => tag.uses > 0);

                if (Util.empty(usageTags)) {
                    return `${getEmoji("info")} ${isSelf ? "You have" : `User \`${user.username}\` has`} **no** tags with usage.`;
                }

                const header = `${getEmoji("info")} ${userLabel} tag usage:`;

                return await PaginationUtil.paginate(ctx, {
                    items: usageTags,
                    defaultLimit: TagLeaderboardCommand.defaultLimit,

                    render: (items, { page }) => {
                        const startIndex = (page - 1) * ctx.pageSize,
                            desc = formatUserTags(items, startIndex, true);

                        return {
                            content: header,
                            embeds: [new EmbedBuilder().setDescription(desc)]
                        };
                    },

                    dumpHeader: header,
                    formatDump: (items, discord = true) => formatUserTags(items, 0, discord),
                    filename: `usage_${user.username}.txt`
                });
            }

            const stats = await getClient().tagManager.userLeaderboard(user.id, 0);

            if (stats === null) {
                return `${getEmoji("info")} ${isSelf ? "You have" : `User \`${user.username}\` has`} **no** tags.`;
            }

            const countNum = Util.formatNumber(stats.count),
                countSuffix = ` tag${stats.count === 1 ? "" : "s"}`,
                quotaNum = Util.formatNumber(stats.quota, 2);

            return `${getEmoji("info")} ${userLabel} leaderboard positions:\n- Count: **#${stats.countPos}** (${countNum}${countSuffix})\n- Size: **#${stats.sizePos}** (${quotaNum} kb)`;
        }

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: TagLeaderboardCommand.defaultLimit,
            maxLimit: TagLeaderboardCommand.maxLimit
        });

        let fetchLimit = TagLeaderboardCommand.maxLimit;

        if (paginationOpts.all) {
            fetchLimit = TagLeaderboardCommand.dumpLimit;
        } else if (!Util.empty(part1)) {
            const parsedLimit = Util.parseInt(part1);

            if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
                return `${getEmoji("warn")} Invalid limit: ${part1}`;
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
