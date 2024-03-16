import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "edit",
    parent: "tag",
    subcommand: true,
    handler: async function (args, msg, perm) {
        if (args.length === 0) {
            return ":information_source: `t edit name body`";
        }

        const [t_name, t_args] = Util.splitArgs(args);

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

        if (perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                out = `:warning: You can only edit your own tags.`;

            if (!owner) {
                return out + " Tag owner not found.";
            }

            return out + ` The tag is owned by \`${owner.username}\`.`;
        }

        const parsed = await this.parentCmd.parseBase(t_args, msg),
            { body, type } = parsed;

        if (typeof parsed.err !== "undefined") {
            return parsed.err;
        }

        try {
            await getClient().tagManager.edit(tag, body, type);
        } catch (err) {
            if (err.name === "TagError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Edited tag **${t_name}**.`;
    }
};
