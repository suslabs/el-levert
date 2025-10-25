import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "rename",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name new_name")}`;
        }

        let [t_name, n_name] = ParserUtil.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        {
            let err1, err2;
            [t_name, err1] = getClient().tagManager.checkName(t_name, false);
            [n_name, err2] = getClient().tagManager.checkName(n_name, false);

            if (err1 !== null || err2 !== null) {
                return `:warning: ${err1 ?? err2}.`;
            }
        }

        if (Util.empty(n_name)) {
            return ":warning: You must specify the new tag name.";
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if (tag.owner !== msg.author.id && !getClient().permManager.allowed(perm, "mod")) {
            const out = ":warning: You can only rename your own tags.",
                owner = await tag.getOwner();

            return out + (owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`);
        }

        try {
            await getClient().tagManager.rename(tag, n_name, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            switch (err.message) {
                case "Tag already exists":
                    const tag = err.ref,
                        owner = await tag.getOwner();

                    const out = `:warning: Tag **${tag.name}** already exists,`;
                    return out + (owner === "not found" ? " tag owner not found." : ` and is owned by \`${owner}\`.`);
                default:
                    return `:warning: ${err.message}.`;
            }
        }

        return `:white_check_mark: Renamed tag **${t_name}** to **${n_name}**.`;
    }
};
