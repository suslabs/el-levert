import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "update_group",
    aliases: ["edit", "edit_group"],
    parent: "perm",
    subcommand: true,
    allowed: "admin",

    handler: async function (args, msg, perm) {
        let [g_name, g_data] = ParserUtil.splitArgs(args);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(g_data)) {
            return `:information_source: ${this.getArgsHelp("group_name (new_name/unchanged) (new_level/unchanged)")}`;
        }

        {
            let err;
            [g_name, err] = getClient().permManager.checkName(g_name, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (group === null) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        let [newName, newLevel] = ParserUtil.splitArgs(g_data);

        if (Util.empty(newName) || newName === "unchanged") {
            newName = null;
        } else {
            let err;
            [newName, err] = getClient().permManager.checkName(newName, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        if (Util.empty(newLevel) || newLevel === "unchanged") {
            newLevel = null;
        } else {
            newLevel = Util.parseInt(newLevel);
            let err;
            [newLevel, err] = getClient().permManager.checkLevel(newLevel, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        if (!getClient().permManager.allowed(perm, newLevel)) {
            return `:warning: Can't update a group to have a level that is higher than your own. (**${perm}** < **${newLevel}**)`;
        }

        try {
            await getClient().permManager.updateGroup(group, newName, newLevel, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            switch (err.message) {
                case "Group already exists":
                    return `:warning: Group **${g_name}** already exists.`;
                default:
                    return `:warning: ${err.message}.`;
            }
        }

        return `:white_check_mark: Updated group **${g_name}**.`;
    }
};
