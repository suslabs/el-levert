import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "remove",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,
    handler: async args => {
        const [g_name, u_name] = Util.splitArgs(args);

        if (args.length === 0 || g_name.length === 0 || u_name.length === 0) {
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

        const find = (await getClient().findUsers(u_name))[0];

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
