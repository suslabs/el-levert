import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "owner",
    parent: "tag",
    subcommand: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name")}`;
        }

        const [t_name] = Util.splitArgs(args, true);

        if (this.isSubcmdName(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return ":warning: " + err;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        let owner = Util.first(
            await getClient().findUsers(tag.owner, {
                onlyMembers: true
            })
        );

        if (typeof owner === "undefined") {
            owner = await getClient().findUserById(tag.owner);

            if (typeof owner === "undefined") {
                return ":warning: Tag owner not found.";
            }
        }

        let out = `:information_source: Tag **${t_name}** is owned by \`${owner.user.username}\``;

        if (owner.nickname) {
            out += ` (also known as \`${owner.nickname}\`)`;
        }

        return out;
    }
};
