import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "add_group",
    aliases: ["create", "create_group"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async (args, msg) => {
        let [g_name, level] = Util.splitArgs(args);
        level = parseInt(level, 10);

        if (args.length === 0 || g_name.length === 0 || level.length === 0) {
            return ":information_source: `perm add_group [group name] [level]`";
        }

        const e = getClient().permManager.checkName(g_name);
        if (e) {
            return ":warning: " + e;
        }

        const maxLevel = await getClient().permManager.maxLevel(msg.author.id);

        if (maxLevel < level) {
            return `:warning: Can't create a group with a level that is higher than your own. (${maxLevel} < ${level})`;
        }

        try {
            await getClient().permManager.addGroup(g_name, level);
        } catch (err) {
            if (err.name === "PermissionError") {
                switch (err.message) {
                    case "Group already exists":
                        return `:warning: Group **${g_name}** already exists.`;
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
