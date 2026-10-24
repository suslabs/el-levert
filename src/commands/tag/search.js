import { getClient, getEmoji } from "../../LevertClient.js";

import TagManager from "../../managers/database/TagManager.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

class TagSearchCommand {
    static defaultResultLimit = TagManager.defaultSearchLimit;
    static maxResultLimit = 100;

    static info = {
        name: "search",
        aliases: ["find"],
        parent: "tag",
        subcommand: true,
        args: "<name> [limit|all] [--page <num>] [--limit <num>] [--all]",
        description: "Search for tags by matching names against a query string using substring or similarity matching.",
        usage: "- <name>: Query string to match against tag names.\n- [limit|all]: Maximum results to display, or 'all'.",
        parser: {
            requireArgs: true
        },
        arguments: [
            ...PaginationUtil.getPaginationArguments({
                defaultLimit: TagSearchCommand.defaultResultLimit,
                maxLimit: TagSearchCommand.maxResultLimit
            }),
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "resultText",
                kind: "positional",
                index: 1,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            m_text = ctx.arg("resultText"),
            all = m_text === "all";

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: TagSearchCommand.defaultResultLimit,
            maxLimit: TagSearchCommand.maxResultLimit
        });

        const isAll = paginationOpts.all || all;

        let customLimit = null;

        if (!Util.empty(m_text) && !isAll) {
            const parsed = Util.parseInt(m_text);

            if (Number.isNaN(parsed) || parsed < 1) {
                return `${getEmoji("warn")} Invalid number: ${m_text}`;
            }

            customLimit = Util.clamp(parsed, 1, TagSearchCommand.maxResultLimit);
        }

        const pageSize = customLimit ?? paginationOpts.limit ?? TagSearchCommand.defaultResultLimit;

        if (isAll) {
            const { results: find } = await getClient().tagManager.search(t_name, {}, { all: true });

            if (Util.empty(find)) {
                return `${getEmoji("info")} Found **no** similar tags.`;
            }

            const s = Util.single(find) ? "" : "s",
                count = Util.formatNumber(find.length),
                header = `${getEmoji("info")} Found **${count}** similar tag${s}:`;

            if (find.length > 2 * TagSearchCommand.defaultResultLimit) {
                return {
                    content: header,
                    ...DiscordUtil.getFileAttach(find.join("\n"), "tags.txt")
                };
            }

            return `${header} **${find.join("**, **")}**`;
        }

        const initialRes = await getClient().tagManager.search(
            t_name,
            {},
            { page: paginationOpts.page ?? 1, limit: pageSize }
        );

        const totalCount = initialRes.totalCount ?? initialRes.other?.total ?? initialRes.results?.length ?? 0;

        if (totalCount === 0) {
            return `${getEmoji("info")} Found **no** similar tags.`;
        }

        const plus = initialRes.other?.oversized ? "+" : "",
            s = totalCount === 1 ? "" : "s",
            count = Util.formatNumber(totalCount) + plus,
            header = `${getEmoji("info")} Found **${count}** similar tag${s}:`;

        if (totalCount <= TagSearchCommand.defaultResultLimit && totalCount <= pageSize) {
            return `${header} **${initialRes.results.join("**, **")}**`;
        }

        return await PaginationUtil.paginate(ctx, {
            initialData: {
                items: initialRes.results,
                totalCount,
                page: paginationOpts.page ?? 1
            },
            defaultLimit: pageSize,

            fetch: async ({ page, limit, offset }) => {
                return await getClient().tagManager.search(t_name, {}, { page, limit, offset });
            },

            render: items => ({
                content: `${header} **${items.join("**, **")}**`
            }),

            dumpHeader: header,
            formatDump: async () => {
                const { results } = await getClient().tagManager.search(t_name, {}, { all: true });
                return results.join("\n");
            },
            filename: "tags.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagSearchCommand;
