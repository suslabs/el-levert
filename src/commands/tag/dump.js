import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "dump",
    aliases: ["all", "list_all"],
    parent: "tag",
    subcommand: true,

    handler: async args => {
        const [d_type, s_str] = Util.splitArgs(args),
            full = d_type === "full",
            inline = d_type === "inline";

        const tags = await getClient().tagManager.dump(full);

        if (tags.length < 1) {
            return ":information_source: There are no tags registered.";
        }

        let format;

        if (full) {
            let space;

            if (s_str.length > 0) {
                space = parseInt(s_str);

                if (isNaN(space) || space < 0) {
                    return ":warning: Invalid indentation: " + s_str;
                }
            }

            format = JSON.stringify(tags, undefined, space);
            return Util.getFileAttach(format, "tags.json");
        }

        if (inline) {
            format = tags.join(",");
        } else {
            format = tags.join("\n");
        }

        return Util.getFileAttach(format, "tags.txt");
    }
};
