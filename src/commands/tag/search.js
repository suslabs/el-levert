import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

const defaultResultLimit = 20;

export default {
    name: "search",
    aliases: ["find"],
    parent: "tag",
    subcommand: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name [all/max_results]")}`;
        }

        let [t_name, m_str] = ParserUtil.splitArgs(args, [true, true]),
            all = m_str === "all";

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        let maxResults;

        if (all) {
            maxResults = Infinity;
        } else if (!Util.empty(m_str)) {
            maxResults = Util.parseInt(m_str);

            if (Number.isNaN(maxResults) || maxResults < 1) {
                return ":warning: Invalid number: " + m_str;
            }
        } else {
            maxResults = defaultResultLimit;
        }

        const {
            results: find,
            other: { oversized }
        } = await getClient().tagManager.search(t_name, maxResults, 0.6);

        if (Util.empty(find)) {
            return ":information_source: Found **no** similar tags.";
        }

        const plus = oversized ? "+" : "",
            s = Util.single(find) ? "" : "s";

        const count = Util.formatNumber(find.length) + plus,
            header = `:information_source: Found **${count}** similar tag${s}:`;

        if (find.length > 2 * defaultResultLimit) {
            const names = find.join("\n");

            return {
                content: header,
                ...DiscordUtil.getFileAttach(names, "tags.txt")
            };
        } else {
            const names = `**${find.join("**, **")}**`;
            return `${header} ${names}`;
        }
    }
};
