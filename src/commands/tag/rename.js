import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "rename",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name new_name")}`;
        }

        const [t_name, n_name] = Util.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e1 = getClient().tagManager.checkName(t_name),
            e2 = getClient().tagManager.checkName(n_name);

        if (e1 ?? e2) {
            return ":warning: " + e1 ?? e2;
        }

        if (Util.empty(n_name)) {
            return ":warning: You must specify the new tag name.";
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if (perm < getClient().permManager.modLevel && tag.owner !== msg.author.id) {
            const out = ":warning: You can only rename your own tags.",
                owner = await tag.getOwner();

            if (owner === null) {
                return out + " Tag owner not found.";
            }

            return out + ` Tag is owned by \`${owner.username}\`.`;
        }

        try {
            await getClient().tagManager.rename(tag, n_name);
        } catch (err) {
            if (err.name === "TagError") {
                switch (err.message) {
                    case "Tag already exists":
                        const out = `:warning: Tag **${t_name}** already exists,`;

                        const tag = err.ref,
                            owner = await tag.getOwner();

                        if (owner === "not found") {
                            return out + " tag owner not found.";
                        }

                        return out + ` and is owned by \`${owner}\``;
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        return `:white_check_mark: Renamed tag **${t_name}** to **${n_name}**.`;
    }
};
