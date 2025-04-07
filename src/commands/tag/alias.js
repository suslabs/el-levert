import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "alias",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name other_tag [args]")}`;
        }

        const [t_name, t_args] = ParserUtil.splitArgs(args, true),
            [a_name, a_args] = ParserUtil.splitArgs(t_args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const err1 = getClient().tagManager.checkName(t_name),
            err2 = getClient().tagManager.checkName(a_name);

        if (err1 ?? err2) {
            return ":warning: " + err1 ?? err2;
        }

        if (Util.empty(a_name)) {
            return `:warning: Alias target must be specified.
If you want to de-alias the tag, \`edit\` it.`;
        }

        let tag = await getClient().tagManager.fetch(t_name),
            out = "";

        if (tag && perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const out = `:warning: You can only edit your own tags.`,
                owner = await tag.getOwner();

            if (owner === "not found") {
                return out + " Tag owner not found.";
            }

            return out + ` The tag is owned by \`${owner}\`.`;
        }

        const a_tag = await getClient().tagManager.fetch(a_name);

        if (!a_tag) {
            return `:warning: Tag **${a_name}** doesn't exist.`;
        }

        let created = false;

        try {
            const createOptions = {
                name: t_name,
                owner: msg.author.id
            };

            [, created] = await getClient().tagManager.alias(tag, a_tag, a_args, createOptions);
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
