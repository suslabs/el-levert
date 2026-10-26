import { EmbedBuilder } from "discord.js";

import PositionalCommandReader from "../../parsers/command/reader/PositionalCommandReader.js";

import LeaderboardTypes from "../../util/commands/LeaderboardTypes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import TagManager from "../../managers/database/TagManager.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

const isUses = type => type === "uses" || type === "usage";

function formatLeaderboard(leaderboard, type, startIndex = 0, discord = true) {
    return leaderboard
        .map((entry, i) => {
            const index = `${startIndex + i + 1}. `;

            const name = isUses(type) ? `${entry.name}${entry.exists ? "" : "*"}` : entry.user.username;

            const label = discord ? `\`${name}\`: ` : `${name}: `;

            let value;

            switch (type) {
                case "count": {
                    const countNum = Util.formatNumber(entry.count),
                        s = entry.count === 1 ? "" : "s";

                    value = (discord ? `**${countNum}**` : countNum) + ` tag${s}`;
                    break;
                }
                case "size": {
                    const quotaNum = Util.formatNumber(entry.quota, 2);

                    value = (discord ? `**${quotaNum}**` : quotaNum) + " kb";
                    break;
                }
                case "uses":
                case "usage": {
                    const useNum = Util.formatNumber(entry.count),
                        s = entry.count === 1 ? "" : "s";

                    value = (discord ? `**${useNum}**` : useNum) + ` use${s}`;
                    break;
                }
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
                s = tag.uses === 1 ? "" : "s";

            return `${index}${name}${discord ? `**${useNum}**` : useNum} use${s}`;
        })
        .join("\n");
}

class TagLeaderboardCommand {
    static defaultLimit = TagManager.defaultLeaderboardLimit;
    static maxLimit = TagManager.defaultUserLeaderboardLimit;
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

            if (isUses(part1)) {
                userQuery = part2;
                showUsage = true;
            } else {
                userQuery = part1;
                showUsage = isUses(part2);
            }
        } else if (!LeaderboardTypes.has(l_type)) {
            isUserMode = true;
            userQuery = l_type;
            showUsage = isUses(part1);
        } else if (isUses(l_type)) {
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
                const find = Util.first(await getClient().findUsers(userQuery, { sv_id: ctx.guildId }));

                user = find?.user ?? {
                    id: userQuery,
                    username: userQuery
                };
            }

            const isSelf = user === ctx.msg.author || user.id === ctx.msg.author.id,
                userLabel = isSelf ? "Your" : `User \`${user.username}\`'s`,
                userSubject = isSelf ? "You have" : `User \`${user.username}\` has`;

            if (showUsage) {
                const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
                    defaultLimit: TagLeaderboardCommand.defaultLimit,
                    maxLimit: TagLeaderboardCommand.maxLimit
                });

                if (paginationOpts.all) {
                    const stats = await getClient().tagManager.userLeaderboard(
                        { user: user.id, onlyUsed: true },
                        { all: true }
                    );

                    if (stats === null) {
                        return `${getEmoji("info")} ${userSubject} **no** tags.`;
                    }

                    if (Util.empty(stats.tags)) {
                        return `${getEmoji("info")} ${userSubject} **no** tags with usage.`;
                    }

                    const header = `${getEmoji("info")} ${userLabel} tag usage:`;

                    return await PaginationUtil.paginate(ctx, {
                        items: stats.tags,
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

                const initialRes = await getClient().tagManager.userLeaderboard(
                    { user: user.id, onlyUsed: true },
                    paginationOpts
                );

                if (initialRes === null || initialRes.count <= 0) {
                    return `${getEmoji("info")} ${userSubject} **no** tags.`;
                }

                if (initialRes.totalCount === 0) {
                    return `${getEmoji("info")} ${userSubject} **no** tags with usage.`;
                }

                const header = `${getEmoji("info")} ${userLabel} tag usage:`;

                return await PaginationUtil.paginate(ctx, {
                    initialData: {
                        items: initialRes.tags,
                        totalCount: initialRes.totalCount,
                        page: paginationOpts.page ?? 1
                    },
                    defaultLimit: TagLeaderboardCommand.defaultLimit,
                    maxLimit: TagLeaderboardCommand.maxLimit,

                    fetch: async ({ page, limit, offset }) => {
                        return await getClient().tagManager.userLeaderboard(
                            { user: user.id, onlyUsed: true },
                            { page, limit, offset }
                        );
                    },

                    render: (items, { page }) => {
                        const startIndex = (page - 1) * ctx.pageSize,
                            desc = formatUserTags(items, startIndex, true);

                        return {
                            content: header,
                            embeds: [new EmbedBuilder().setDescription(desc)]
                        };
                    },

                    dumpHeader: header,
                    formatDump: async (items, discord = true) => {
                        const allStats = await getClient().tagManager.userLeaderboard(
                            { user: user.id, onlyUsed: true },
                            { all: true }
                        );
                        return formatUserTags(allStats.tags, 0, discord);
                    },
                    filename: `usage_${user.username}.txt`
                });
            }

            const stats = await getClient().tagManager.userLeaderboard({ user: user.id }, { limit: 0 });

            if (stats === null) {
                return `${getEmoji("info")} ${userSubject} **no** tags.`;
            }

            const countNum = Util.formatNumber(stats.count),
                quotaNum = Util.formatNumber(stats.quota, 2),
                s = stats.count === 1 ? "" : "s";

            return `${getEmoji("info")} ${userLabel} leaderboard positions:\n- Count: **#${stats.countPos}** (**${countNum}** tag${s})\n- Size: **#${stats.sizePos}** (**${quotaNum} kb**)`;
        }

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: TagLeaderboardCommand.defaultLimit,
            maxLimit: TagLeaderboardCommand.maxLimit
        });

        let customLimit = null;

        if (!Util.empty(part1)) {
            const parsedLimit = Util.parseInt(part1);

            if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
                return `${getEmoji("warn")} Invalid limit: ${part1}`;
            }

            customLimit = Util.clamp(parsedLimit, 1, TagLeaderboardCommand.maxLimit);
        }

        const pageSize = customLimit ?? paginationOpts.limit ?? TagLeaderboardCommand.defaultLimit;

        const emptyDesc = isUses(l_type) ? "with usage" : "registered",
            emptyMsg = `${getEmoji("info")} There are **no** tags ${emptyDesc}.`;

        if (paginationOpts.all) {
            const allRes = await getClient().tagManager.leaderboard(
                    { type: l_type, resolveUsers: false },
                    { all: true }
                ),
                leaderboard = Array.isArray(allRes) ? allRes : (allRes?.items ?? []);

            if (Util.empty(leaderboard)) {
                return emptyMsg;
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

        const initialRes = await getClient().tagManager.leaderboard(
            { type: l_type, resolveUsers: false },
            { page: paginationOpts.page ?? 1, limit: pageSize }
        );

        const items = Array.isArray(initialRes) ? initialRes : (initialRes?.items ?? []),
            totalCount = initialRes?.totalCount ?? initialRes?.total ?? items.length;

        if (totalCount === 0 || Util.empty(items)) {
            return emptyMsg;
        }

        const header = `${getEmoji("info")} Tag ${l_type} leaderboard:`;

        return await PaginationUtil.paginate(ctx, {
            initialData: {
                items,
                totalCount,
                page: paginationOpts.page ?? 1
            },
            defaultLimit: pageSize,
            maxLimit: TagLeaderboardCommand.maxLimit,

            fetch: async ({ page, limit, offset }) => {
                return await getClient().tagManager.leaderboard(
                    { type: l_type, resolveUsers: false },
                    { page, limit, offset }
                );
            },

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
                const allRes = await getClient().tagManager.leaderboard(
                        { type: l_type, resolveUsers: false },
                        { all: true }
                    ),
                    allLeaderboard = Array.isArray(allRes) ? allRes : (allRes?.items ?? []);

                await getClient().tagManager.resolveLeaderboardUsers(allLeaderboard, l_type);
                return formatLeaderboard(allLeaderboard, l_type, 0, discord);
            },
            filename: `leaderboard_${l_type}.txt`
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagLeaderboardCommand;
