import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "remove_all",
    aliases: ["take"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async function (args, msg, perm) {
        const [u_name] = ParserUtil.splitArgs(args);

        if (Util.empty(args) || Util.empty(u_name)) {
            return `:information_source: ${this.getArgsHelp("(ping/id/username)")}`;
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

        const theirLevel = await getClient().permManager.maxLevel(find.user.id);

        if (perm < theirLevel) {
            return `:warning: Can't remove permissions of a user (\`${find.user.username}\` \`${find.user.id}\`) with a level higher than your own. (**${perm}** < **${theirLevel}**)`;
        }

        const removed = await getClient().permManager.removeAll(find.user.id);

        if (!removed) {
            const out = `:information_source: User \`${find.user.username}\` (\`${find.user.id}\`) doesn't have any permissions`;

            if (getClient().permManager.isOwner(find.user.id)) {
                return out + " other than being the bot owner.";
            } else {
                return out + ".";
            }
        }

        return `:white_check_mark: Removed \`${find.user.username}\`'s (\`${find.user.id}\`) permissions.`;
    }
};
