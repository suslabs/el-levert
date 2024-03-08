import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "remove_group",
    parent: "perm",
    subcommand: true,
    allowed: 2,
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

        const res = await getClient().permManager.removeGroup(g_name);

        if (!res) {
            return `:warning: Can't remove the **${g_name}** group.`;
        }

        return `:white_check_mark: Removed group **${g_name}** and all of it's users.`;
    }
};
