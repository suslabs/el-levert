import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "owner",
    parent: "t",
    subcommand: true,
    handler: async function(args) {
        if(args.length === 0) {
            return ":information_source: `t owner name`";
        }

        const [t_name] = Util.splitArgs(args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }

        if(this.parentCmd.subNames.includes(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if(!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        const owner = await getClient().findUserById(tag.owner);

        if(!owner) {
            return ":information_source: Tag owner not found.";
        }

        let out = `:information_source: \`${owner.tag}\``;

        if(typeof owner.nickname !== "undefined") {
            out += ` (also known as \`${owner.nickname}\`)`;
        }

        return out;
    }
}