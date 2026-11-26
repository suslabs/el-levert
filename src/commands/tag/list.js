import { EmbedBuilder } from "discord.js";

import TagManager from "../../managers/database/TagManager.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

function formatTagList(tags, startIndex = 0) {
    return tags.map((tag, i) => `${startIndex + i + 1}. ${tag.format()}`).join("\n");
}

function formatFullTags(tags) {
    const [newTags, oldTags] = ArrayUtil.split(tags, tag => tag.isOld);

    const sections = [];

    if (!Util.empty(newTags)) {
        sections.push(`EL LEVERT tags:
${formatTagList(newTags)}`);
    }

    if (!Util.empty(oldTags)) {
        sections.push(`OG Leveret tags:
${formatTagList(oldTags)}`);
    }

    return sections.join("\n\n");
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

        const userSubject = user === ctx.msg.author ? "You have" : `User \`${user.username}\` has`,
            header = `${getEmoji("info")} ${userSubject} the following tags:`;

        const formatEmpty = () => {
            if (user === ctx.msg.author) {
                return `${getEmoji("info")} You don't have any tags. If you want to see the list of all available tags, use \`${this.getSubcmd("dump").getArgsHelp("", false)}\`.`;
            }

            return `${getEmoji("info")} User \`${user.username}\` has **no** tags.`;
        };

        if (paginationOpts.all) {
            const { items } = await getClient().tagManager.list(listOptions, { all: true });

            if (Util.empty(items)) {
                return formatEmpty();
            }

            return await PaginationUtil.dumpAll(ctx, {
                items,
                dumpHeader: header,
                formatDump: formatFullTags,
                filename: "tags.txt"
            });
        }

        const { items, totalCount } = await getClient().tagManager.list(listOptions, paginationOpts);

        if (totalCount < 1) {
            return formatEmpty();
        }

        const s = totalCount === 1 ? "" : "s",
            footer = `${totalCount} total tag${s}`;

        return await PaginationUtil.paginate(ctx, {
            defaultLimit: TagListCommand.defaultLimit,
            initialData: {
                items,
                totalCount,
                page: paginationOpts.page
            },

            fetch: async ({ page, limit, offset }) =>
                await getClient().tagManager.list(listOptions, {
                    page,
                    limit,
                    offset
                }),

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
                return formatFullTags(allTags.items);
            },
            filename: "tags.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagListCommand;
