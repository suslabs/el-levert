import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "alias",
    parent: "tag",
    subcommand: true,
    handler: async function (args, msg, perm) {
        if (args.length === 0) {
            return ":information_source: `t alias name other_tag [args]`";
        }

        const [t_name, t_args] = Util.splitArgs(args),
            [a_name, a_args] = Util.splitArgs(t_args);

        if (this.isSubName(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e1 = getClient().tagManager.checkName(t_name),
            e2 = getClient().tagManager.checkName(a_name);

        if (e1 ?? e2) {
            return ":warning: " + e1 ?? e2;
        }

        if (a_name.length === 0) {
            return `:warning: Alias target must be specified.
If you want to de-alias the tag, \`edit\` it.`;
        }

        let tag = await getClient().tagManager.fetch(t_name),
            out = "";

        if (tag && perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                out = `:warning: You can only edit your own tags.`;

            if (!owner) {
                return `${out} Tag owner not found.`;
            }

            return `${out} The tag is owned by \`${owner.username}\`.`;
        }

        const a_tag = await getClient().tagManager.fetch(a_name);

        if (!a_tag) {
            return `:warning: Tag **${a_tag.name}** doesn't exist.`;
        }

        let created = false;

        try {
            [_, created] = await getClient().tagManager.alias(tag, a_tag, a_args);
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
