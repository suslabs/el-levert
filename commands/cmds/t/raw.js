import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "raw",
    parent: "t",
    subcommand: true,
    handler: async function(args) {
        if(args.length === 0) {
            return ":information_source: `t raw name`";
        }

        const [t_name, t_args] = Util.splitArgs(args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }

        const tag = await getClient().tagManager.fetch(t_name);
        tag.body = tag.body.trim();

        if(!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if(tag.hops.length > 1) {
            let out = `:information_source: Tag **${t_name}** is an alias of **${tag.hops[1]}**`;

            if(tag.args.length > 0) {
                out += ` (with args \`${tag.args}\`)`;
            }

            return out;
        }

        if(tag.type >> 1 === 1) {
            return Util.getFileAttach(tag.body, "script.js");
        }

        return Util.getFileAttach(tag.body, "tag.txt");
    }
}