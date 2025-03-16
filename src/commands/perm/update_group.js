import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "update_group",
    aliases: ["edit", "edit_group"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async (args, msg) => {
        let [g_name, g_data] = Util.splitArgs(args),
            [newName, newLevel] = Util.splitArgs(g_data);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(g_data)) {
            return ":information_source: `perm update_group [group name] [new name/unchanged] [new level/unchanged]`";
        }

        if (Util.empty(newName) || newName === "unchanged") {
            newName = undefined;
        } else {
            const err = getClient().permManager.checkName(g_name);

            if (err) {
                return ":warning: " + err;
            }
        }

        if (Util.empty(newLevel) || newLevel === "unchanged") {
            newLevel = undefined;
        } else {
            newLevel = Util.parseInt(newLevel);
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        const maxLevel = await getClient().permManager.maxLevel(msg.author.id);

        if (maxLevel < newLevel) {
            return `:warning: Can't update a group to have a level that is higher than your own. (${maxLevel} < ${newLevel})`;
        }

        try {
            await getClient().permManager.updateGroup(group, newName, newLevel);
        } catch (err) {
            if (err.name === "PermissionError") {
                switch (err.message) {
                    case "Group already exists":
                        return `:warning: Group **${g_name}** already exists.`;
                    case "Invalid level":
                        return `Invalid level: \`${newLevel}\`. Level must be an int larger than 0.`;
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        return `:white_check_mark: Updated group **${g_name}**.`;
    }
};
