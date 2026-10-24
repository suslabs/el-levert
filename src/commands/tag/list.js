import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import TagManager from "../../managers/database/TagManager.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatTagList(tags, startIndex = 0) {
    return tags.map((tag, i) => `${startIndex + i + 1}. ${tag.format()}`).join("\n");
}

function formatFullTags(tags) {
    let format = "";

    if (!Util.empty(tags.newTags)) {
        format += `EL LEVERT tags:\n${formatTagList(tags.newTags, 0)}`;
    }

    if (!Util.empty(tags.oldTags)) {
        if (!Util.empty(format)) {
            format += "\n\n";
        }

        format += `OG Leveret tags:\n${formatTagList(tags.oldTags, 0)}`;
    }

    return format;
}

class TagListCommand {
    static defaultLimit = TagManager.defaultListLimit;

    static info = {
        name: "list",
        parent: "tag",
        subcommand: true,
        args: "[user] [--page <num>] [--limit <num>] [--all]",
        description: "List all tags registered under your account, or under another specified user's account.",
        usage: "- [user]: Username, mention, or user ID to inspect tags for (defaults to yourself).",
        arguments: [
            ...PaginationUtil.getPaginationArguments({ defaultLimit: TagListCommand.defaultLimit }),
            {
                name: "userName",
                kind: "positional",
                index: 0
            }
        ]
    };

    async handler(ctx) {
        let user = ctx.msg.author;

        const u_name = ctx.arg("userName");

        if (Util.nonemptyString(u_name)) {
            const find = Util.first(await getClient().findUsers(u_name, { sv_id: ctx.guildId }));

            if (typeof find === "undefined") {
                return `${getEmoji("warn")} User \`${u_name}\` not found.`;
            }

            user = find.user;
        }

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: TagListCommand.defaultLimit
        });

        const listOptions = {
            user: user.id,
            all: Boolean(paginationOpts.all)
        };

        if (paginationOpts.all) {
            const tags = await getClient().tagManager.list(listOptions, { all: true });

            if (tags.totalCount < 1) {
                if (user === ctx.msg.author) {
                    return `${getEmoji("info")} You don't have any tags. If you want to see the list of all available tags, use \`${this.getSubcmd("dump").getArgsHelp("", false)}\`.`;
                }

                return `${getEmoji("info")} User \`${user.username}\` has **no** tags.`;
            }

            const allTags = [...tags.newTags, ...tags.oldTags];

            const s = Util.single(allTags) ? "" : "s",
                footer = `${tags.totalCount} total tag${s}`;

            const header = `${getEmoji("info")} ${user === ctx.msg.author ? "You have" : `User \`${user.username}\` has`} the following tags:`;

            return await PaginationUtil.paginate(ctx, {
                items: allTags,
                defaultLimit: TagListCommand.defaultLimit,

                render: (items, { page }) => {
                    const startIndex = (page - 1) * ctx.pageSize,
                        desc = formatTagList(items, startIndex);

                    return {
                        content: header,
                        embeds: [new EmbedBuilder().setDescription(desc).setFooter({ text: footer })]
                    };
                },

                dumpHeader: header,
                formatDump: () => formatFullTags(tags),
                filename: "tags.txt"
            });
        }

        const initialRes = await getClient().tagManager.list(listOptions, paginationOpts),
            totalCount = initialRes?.totalCount ?? initialRes?.count ?? 0;

        if (totalCount < 1) {
            if (user === ctx.msg.author) {
                return `${getEmoji("info")} You don't have any tags. If you want to see the list of all available tags, use \`${this.getSubcmd("dump").getArgsHelp("", false)}\`.`;
            }

            return `${getEmoji("info")} User \`${user.username}\` has **no** tags.`;
        }

        const s = totalCount === 1 ? "" : "s",
            footer = `${totalCount} total tag${s}`;

        const header = `${getEmoji("info")} ${user === ctx.msg.author ? "You have" : `User \`${user.username}\` has`} the following tags:`;

        const fallbackItems = initialRes.items ?? [...(initialRes.newTags ?? []), ...(initialRes.oldTags ?? [])];

        return await PaginationUtil.paginate(ctx, {
            defaultLimit: TagListCommand.defaultLimit,
            initialData: {
                ...initialRes,
                items: fallbackItems,
                totalCount
            },

            fetch: async ({ page, limit, offset }) => {
                return await getClient().tagManager.list(listOptions, { page, limit, offset });
            },

            render: (items, { page }) => {
                const startIndex = (page - 1) * ctx.pageSize,
                    desc = formatTagList(items, startIndex);

                return {
                    content: header,
                    embeds: [new EmbedBuilder().setDescription(desc).setFooter({ text: footer })]
                };
            },

            dumpHeader: header,
            formatDump: async () => {
                const allTags = await getClient().tagManager.list(listOptions, { all: true });
                return formatFullTags(allTags);
            },
            filename: "tags.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagListCommand;
