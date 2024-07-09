import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "raw",
    aliases: ["code"],
    parent: "tag",
    subcommand: true,
    handler: async function (args) {
        if (args.length === 0) {
            return ":information_source: `t raw name`";
        }

        const [t_name] = Util.splitArgs(args);

        if (this.isSubName(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        const out = tag.getRaw(true);
        out.content = out.content ? `:information_source: ${out.content}` : out.content;

        return out;
    }
};
