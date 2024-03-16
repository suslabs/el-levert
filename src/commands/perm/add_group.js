import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "add_group",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,
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

        try {
            await getClient().permManager.addGroup(g_name, level);
        } catch (err) {
            if (err.name === "PermissionError") {
                switch (err.message) {
                    case "Invalid level":
                        return `Invalid level: \`${level}\`. Level must be an int larger than 0.`;
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        return `:white_check_mark: Added group **${g_name}**.`;
    }
};
