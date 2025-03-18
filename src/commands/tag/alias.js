import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "alias",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name other_tag [args]")}`;
        }

        const [t_name, t_args] = Util.splitArgs(args, true),
            [a_name, a_args] = Util.splitArgs(t_args, true);

        if (this.isSubcmdName(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e1 = getClient().tagManager.checkName(t_name),
            e2 = getClient().tagManager.checkName(a_name);

        if (e1 ?? e2) {
            return ":warning: " + e1 ?? e2;
        }

        if (Util.empty(a_name)) {
            return `:warning: Alias target must be specified.
If you want to de-alias the tag, \`edit\` it.`;
        }

        let tag = await getClient().tagManager.fetch(t_name),
            out = "";

        if (tag && perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                out = `:warning: You can only edit your own tags.`;

            if (!owner) {
                return out + " Tag owner not found.";
            }

            return out + ` The tag is owned by \`${owner.username}\`.`;
        }

        const a_tag = await getClient().tagManager.fetch(a_name);

        if (!a_tag) {
            return `:warning: Tag **${a_name}** doesn't exist.`;
        }

        let newTag,
            created = false;

        try {
            const createOptions = {
                name: t_name,
                owner: msg.author.id
            };

            [newTag, created] = await getClient().tagManager.alias(tag, a_tag, a_args, createOptions);
        } catch (err) {
            if (err.name === "TagError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        if (created) {
            out = `Created tag **${t_name}**. `;
        }

        return `:white_check_mark: ${out}Aliased tag **${t_name}** to **${a_name}**.`;
    }
};
