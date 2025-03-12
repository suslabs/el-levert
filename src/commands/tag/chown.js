import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "chown",
    aliases: ["transfer"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return ":information_source: `t chown name new_owner_mention`";
        }

        const [t_name, t_args] = Util.splitArgs(args, true);

        if (this.isSubName(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        if (Util.empty(t_args)) {
            return ":warning: Invalid target user. You must specifically mention the target user.";
        }

        const find = Util.first(await getClient().findUsers(t_args));

        if (typeof find === "undefined") {
            return `:warning: User \`${t_args}\` not found.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if (perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                out = ":warning: You can only edit your own tags.";

            if (!owner) {
                return out + " Tag owner not found.";
            }

            return out + ` The tag is owned by \`${owner.username}\`.`;
        }

        try {
            await getClient().tagManager.chown(tag, find.user.id);
        } catch (err) {
            if (err.name === "TagError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Transferred tag **${t_name}** to \`${find.user.username}\`.`;
    }
};
