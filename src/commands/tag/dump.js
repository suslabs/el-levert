import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

export default {
    name: "dump",
    aliases: ["all", "list_all"],
    parent: "tag",
    subcommand: true,

    handler: async args => {
        const [d_type, s_str] = ParserUtil.splitArgs(args, true),
            full = d_type === "full",
            inline = d_type === "inline";

        let tags = await getClient().tagManager.dump(full);

        if (Util.empty(tags)) {
            return ":information_source: There are **no** tags registered.";
        }

        if (full) {
            let spaces = 0;

            if (!Util.empty(s_str)) {
                spaces = Util.parseInt(s_str);

                if (Number.isNaN(spaces) || spaces < 0) {
                    return ":warning: Invalid indentation: " + s_str;
                }
            }

            const tagData = tags.map(tag => tag.getData()),
                format = JSON.stringify(tagData, undefined, spaces);

            return DiscordUtil.getFileAttach(format, "tags.json");
        }

        const format = tags.join(inline ? "," : "\n");
        return DiscordUtil.getFileAttach(format, "tags.txt");
    }
};
