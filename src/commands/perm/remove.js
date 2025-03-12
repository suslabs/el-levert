import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "remove",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async (args, msg) => {
        const [g_name, u_name] = Util.splitArgs(args);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(u_name)) {
            return ":information_source: `perm remove [group name] [ping/id/username]`";
        }

        const e = getClient().permManager.checkName(g_name);
        if (e) {
            return ":warning: " + e;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        const maxLevel = await getClient().permManager.maxLevel(msg.author.id);

        if (maxLevel < group.level) {
            return `:warning: Can't remove a user from a group with a higher level your own. (${maxLevel} < ${group.level})`;
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            return `:warning: User \`${u_name}\` not found.`;
        }

        let removed = false;

        try {
            removed = await getClient().permManager.remove(group, find.user.id);
        } catch (err) {
            if (err.name === "PermissionError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        if (!removed) {
            return `:warning: User \`${find.user.username}\` (${find.user.id}) is not in group **${g_name}**.`;
        }

        return `:white_check_mark: Removed user \`${find.user.username}\` (${find.user.id}) from group **${g_name}**.`;
    }
};
