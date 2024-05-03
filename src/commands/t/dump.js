import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "dump",
    aliases: ["all", "list_all"],
    parent: "tag",
    subcommand: true,
    handler: async args => {
        const split = args.split(" "),
            full = split[0] === "full",
            inline = split[0] === "inline";

        const tags = await getClient().tagManager.dump(full);

        if (tags.length < 1) {
            return ":information_source: There are no registered tags.";
        }

        let format;

        if (full) {
            let space;

            if (split.length > 1) {
                space = parseInt(split[1]);

                if (isNaN(space)) {
                    return ":warning: Invalid indentation: " + split[1];
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
