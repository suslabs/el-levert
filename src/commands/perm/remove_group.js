import Util from "../../util/Util.js";
import { getClient } from "../../LevertClient.js";

export default {
    name: "remove_group",
    parent: "perm",
    subcommand: true,
    allowed: 2,
    handler: async (args, msg) => {
        if (args.length === 0) {
            return ":information_source: `perm remove_group [group name]`";
        }

        const [g_name] = Util.splitArgs(args),
            e = getClient().permManager.checkName(g_name);

        if (e) {
            return ":warning: " + e;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        await getClient().permManager.removeGroup(g_name);

        return `:white_check_mark: Removed group **${g_name}** and all it's users.`;
    }
};
