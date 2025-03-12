import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "remove_all",
    aliases: ["take"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async (args, msg) => {
        const [u_name] = Util.splitArgs(args);

        if (Util.empty(args) || Util.empty(u_name)) {
            return ":information_source: `perm remove_all [ping/id/username]`";
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            if (getClient().permManager.isOwner(msg.author.id)) {
                let out = `:warning: User \`${u_name}\` not found. Tried removing by verbatim input: \`${u_name}\``,
                    removed = await getClient().permManager.removeAll(u_name);

                if (!removed) {
                    out += "\nUser doesn't have any permissions.";
                }

                return out;
            } else {
                return `:warning: User \`${u_name}\` not found.`;
            }
        }

        const yourLevel = await getClient().permManager.maxLevel(msg.author.id),
            theirLevel = await getClient().permManager.maxLevel(find.user.id);

        if (yourLevel < theirLevel) {
            return `:warning: Can't remove permissions of a user with a level higher than your own. (${yourLevel} < ${theirLevel})`;
        }

        const removed = await getClient().permManager.removeAll(find.user.id);

        if (!removed) {
            const out = `:information_source: User \`${find.user.username}\` doesn't have any permissions`;

            if (getClient().permManager.isOwner(find.user.id)) {
                return `${out} other than being the bot owner.`;
            }

            return out + ".";
        }

        return `:white_check_mark: Removed \`${find.user.username}\`'s permissions.`;
    }
};
