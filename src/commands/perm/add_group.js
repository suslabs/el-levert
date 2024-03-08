import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "add_group",
    parent: "perm",
    subcommand: true,
    allowed: 2,
    handler: async args => {
        let [g_name, level] = Util.splitArgs(args);

        if (args.length === 0 || g_name.length === 0 || level.length === 0) {
            return ":information_source: `perm add_group [group name] [level]`";
        }

        const e = getClient().permManager.checkName(g_name);
        if (e) {
            return ":warning: " + e;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (group) {
            return `:warning: Group **${g_name}** already exists.`;
        }

        level = parseInt(level);

        if (isNaN(level) || level < 0) {
            return `:warning: Invalid level: \`${level}\`. Level must be an int larger than 0.`;
        }

        const res = await getClient().permManager.addGroup(g_name, level);

        if (!res) {
            return `:warning: Can't create the **${g_name}** group.`;
        }

        return `:white_check_mark: Added group **${g_name}**.`;
    }
};
