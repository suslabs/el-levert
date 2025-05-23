import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "raw",
    aliases: ["code"],
    parent: "tag",
    subcommand: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name")}`;
        }

        const [t_name] = ParserUtil.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return `:warning: ${err}.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        const out = tag.getRaw(true);
        out.content = out.content ? `:information_source: ${out.content}` : out.content;

        return out;
    }
};
