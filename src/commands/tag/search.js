import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

class TagSearchCommand {
    static defaultResultLimit = 20;
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

        let maxResults = Infinity;

        if (!Util.empty(m_text) && !isAll) {
            maxResults = Util.parseInt(m_text);

            if (Number.isNaN(maxResults) || maxResults < 1) {
                return `${getEmoji("warn")} Invalid number: ${m_text}`;
            }

            maxResults = Util.clamp(maxResults, 1, TagSearchCommand.maxResultLimit);
        }

        const {
            results: find,
            other: { oversized }
        } = await getClient().tagManager.search(t_name, maxResults, 0.6);

        if (Util.empty(find)) {
            return `${getEmoji("info")} Found **no** similar tags.`;
        }

        const plus = oversized ? "+" : "",
            s = Util.single(find) ? "" : "s",
            count = Util.formatNumber(find.length) + plus,
            header = `${getEmoji("info")} Found **${count}** similar tag${s}:`;

        if (isAll || find.length <= TagSearchCommand.defaultResultLimit) {
            if (find.length > 2 * TagSearchCommand.defaultResultLimit) {
                return {
                    content: header,
                    ...DiscordUtil.getFileAttach(find.join("\n"), "tags.txt")
                };
            }

            return `${header} **${find.join("**, **")}**`;
        }

        return await PaginationUtil.paginate(ctx, {
            items: find,
            defaultLimit: TagSearchCommand.defaultResultLimit,

            render: items => ({
                content: `${header} **${items.join("**, **")}**`
            }),

            dumpHeader: header,
            formatDump: items => items.join("\n"),
            filename: "tags.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagSearchCommand;
