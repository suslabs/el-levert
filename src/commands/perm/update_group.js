import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "update_group",
    aliases: ["edit", "edit_group"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async function (args, msg, perm) {
        let [g_name, g_data] = ParserUtil.splitArgs(args),
            [newName, newLevel] = ParserUtil.splitArgs(g_data);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(g_data)) {
            return `:information_source: ${this.getArgsHelp("group_name (new_name/unchanged) (new_level/unchanged)")}`;
        }

        if (Util.empty(newName) || newName === "unchanged") {
            newName = null;
        } else {
            const err = getClient().permManager.checkName(g_name);

            if (err) {
                return ":warning: " + err;
            }
        }

        if (Util.empty(newLevel) || newLevel === "unchanged") {
            newLevel = null;
        } else {
            newLevel = Util.parseInt(newLevel);
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (group === null) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        if (perm < newLevel) {
            return `:warning: Can't update a group to have a level that is higher than your own. (**${perm}** < **${newLevel}**)`;
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
