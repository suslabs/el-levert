import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

const defaultResultLimit = 20;

export default {
    name: "search",
    aliases: ["find", "query"],
    parent: "tag",
    subcommand: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("query [all/max_results]")}`;
        }

        const [t_name, m_str] = ParserUtil.splitArgs(args, [true, true]),
            all = m_str === "all";

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return `:warning: ${err}.`;
        }

        let maxResults = defaultResultLimit;

        if (all) {
            maxResults = Infinity;
        } else if (!Util.empty(m_str)) {
            maxResults = Util.parseInt(m_str);

            if (Number.isNaN(maxResults) || maxResults < 1) {
                return ":warning: Invalid number: " + m_str;
            }
        }

        const find = await getClient().tagManager.search(t_name, maxResults);

        if (Util.empty(find)) {
            return ":information_source: Found no similar tags.";
        }

        const s = Util.single(find) ? "" : "s",
            count = Util.formatNumber(find.length),
            header = `:information_source: Found **${count}** similar tag${s}:`;

        if (count > defaultResultLimit * 2) {
            const names = find.join(", ");

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
