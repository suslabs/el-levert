import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "delete",
    aliases: ["remove"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
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

        if (tag.owner !== msg.author.id && perm < getClient().permManager.modLevel) {
            const out = ":warning: You can only delete your own tags.",
                owner = await tag.getOwner();

            if (owner === "not found") {
                return out + " Tag owner not found.";
            } else {
                return out + ` The tag is owned by \`${owner}\`.`;
            }
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
