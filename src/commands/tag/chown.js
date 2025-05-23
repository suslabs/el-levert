import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "chown",
    aliases: ["transfer"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name new_owner")}`;
        }

        const [t_name, t_args] = ParserUtil.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return `:warning: ${err}.`;
        }

        if (Util.empty(t_args)) {
            return ":warning: Invalid target user. You must specifically mention the target user.";
        }

        const find = Util.first(await getClient().findUsers(t_args));

        if (typeof find === "undefined") {
            return `:warning: User \`${t_args}\` not found.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if (tag.owner !== msg.author.id && perm < getClient().permManager.modLevel) {
            const out = ":warning: You can only edit your own tags.",
                owner = await tag.getOwner();

            if (owner === "not found") {
                return out + " Tag owner not found.";
            } else {
                return out + ` The tag is owned by \`${owner}\`.`;
            }
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
