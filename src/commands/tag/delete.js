import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "delete",
    aliases: ["remove"],
    parent: "tag",
    subcommand: true,
    handler: async function (args, msg, perm) {
        if (args.length === 0) {
            return ":information_source: `t delete name`";
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

        if (perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                out = ":warning: You can only delete your own tags.";

            if (!owner) {
                return `${out} Tag owner not found.`;
            }

            return `${out} Tag is owned by \`${owner.username}\`.`;
        }

        try {
            await getClient().tagManager.delete(tag);
        } catch (err) {
            if (err.name === "TagError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Deleted tag **${t_name}**.`;
    }
};
