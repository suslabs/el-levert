import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

const defaultResultLimit = 20;

class TagSearchCommand {
    static info = {
        name: "search",
        aliases: ["find"],
        parent: "tag",
        subcommand: true,
        args: "<name> [limit|all]",
        description: "Search for tags by matching names against a query string using substring or similarity matching.",
        usage: "- <name>: Query string to match against tag names.\n- [limit|all]: Maximum results to display, or 'all'.",
        parser: {
            requireArgs: true
        },
        arguments: [
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

        let maxResults = 0;

        if (all) {
            maxResults = Infinity;
        } else if (!Util.empty(m_text)) {
            maxResults = Util.parseInt(m_text);

            if (Number.isNaN(maxResults) || maxResults < 1) {
                return `${getEmoji("warn")} Invalid number: ${m_text}`;
            }
        } else {
            maxResults = defaultResultLimit;
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

        if (find.length > 2 * defaultResultLimit) {
            return {
                content: header,
                ...DiscordUtil.getFileAttach(find.join("\n"), "tags.txt")
            };
        }

        return `${header} **${find.join("**, **")}**`;
    }
}

export default TagSearchCommand;
