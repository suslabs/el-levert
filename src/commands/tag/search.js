import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const defaultResultLimit = 20;

export default {
    name: "search",
    aliases: ["find", "query"],
    parent: "tag",
    subcommand: true,

    handler: async args => {
        if (Util.empty(args)) {
            return ":information_source: `t search query (all/max_results)`";
        }

        const [t_name, m_str] = Util.splitArgs(args, [true, true]),
            all = m_str === "all";

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
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

        const s = Util.multiple(find) ? "s" : "",
            header = `:information_source: Found **${find.length}** similar tag${s}:`;

        let outLength = header.length + 1;

        outLength += find.reduce((sum, name) => sum + name.length, 0);
        outLength += (find.length - 1) * "**, **".length + 2 * "**".length;

        if (outLength >= getClient().commandHandler.outCharLimit) {
            const names = find.join(", ");

            return {
                content: header,
                ...Util.getFileAttach(names, "tags.txt")
            };
        }

        const names = `**${find.join("**, **")}**`;
        return `${header} ${names}`;
    }
};
