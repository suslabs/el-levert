import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "dump",
    aliases: ["all", "list_all"],
    parent: "tag",
    subcommand: true,
    handler: async args => {
        const full = args === "full",
            tags = await getClient().tagManager.dump(full);

        if (tags.length < 1) {
            return ":warning: There are no registered tags.";
        }

        let format;

        if (full) {
            format = JSON.stringify(tags);
        } else {
            format = tags.join("\n");
        }

        return Util.getFileAttach(format);
    }
};
