import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "owner",
    parent: "tag",
    subcommand: true,
    handler: async function (args) {
        if (args.length === 0) {
            return ":information_source: `t owner name`";
        }

        const [t_name] = Util.splitArgs(args);

        if (this.isSubName(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        const owner = await getClient().findUserById(tag.owner);

        if (!owner) {
            return ":warning: Tag owner not found.";
        }

        let out = `:information_source: Tag **${t_name}** is owned by \`${owner.username}\``;

        if (typeof owner.nickname !== "undefined") {
            out += ` (also known as \`${owner.nickname}\`)`;
        }

        return out;
    }
};
