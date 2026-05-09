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
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: [true, true]
            },
            {
                name: "resultText",
                parser: "split",
                index: 1,
                lowercase: [true, true]
            }
        ]
    };

    async handler(ctx) {

        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name [all/max_results]")}`;
        }

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
