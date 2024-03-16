import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "remove_group",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,
    handler: async args => {
        if (args.length === 0) {
            return ":information_source: `perm remove_group [group name]`";
        }

        const [g_name] = Util.splitArgs(args);

        const e = getClient().permManager.checkName(g_name);
        if (e) {
            return ":warning: " + e;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        try {
            await getClient().permManager.remove(group, find.user.id);
        } catch (err) {
            if (err.name === "PermissionError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Removed group **${g_name}** and all of it's users.`;
    }
};
