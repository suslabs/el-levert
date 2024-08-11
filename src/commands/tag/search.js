import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "search",
    aliases: ["find", "query"],
    parent: "tag",
    subcommand: true,

    handler: async args => {
        if (args.length === 0) {
            return ":information_source: `t search query (all/max_results)`";
        }

        const [t_name, m_str] = Util.splitArgs(args, [true, true]),
            all = m_str === "all";

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        let maxResults = 20;

        if (all) {
            maxResults = Infinity;
        } else if (m_str.length > 0) {
            maxResults = parseInt(m_str);

            if (isNaN(maxResults) || maxResults < 1) {
                return ":warning: Invalid number: " + m_str;
            }
        }

        const find = await getClient().tagManager.search(t_name, maxResults);

        if (find.length < 1) {
            return ":information_source: Found no similar tags.";
        }

        const s = find.length > 1 ? "s" : "",
            header = `:information_source: Found **${find.length}** similar tag${s}:`;

        let outLength = find.reduce((sum, name) => sum + name.length, 0);
        outLength += (find.length - 1) * "**, **".length + 2 * "**".length;

        if (outLength + 1 >= getClient().commandHandler.outCharLimit - header.length) {
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
