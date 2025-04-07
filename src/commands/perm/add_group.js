import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "add_group",
    aliases: ["create", "create_group"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async function (args, msg, perm) {
        let [g_name, level] = ParserUtil.splitArgs(args);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(level)) {
            return `:information_source: ${this.getArgsHelp("group_name level")}`;
        }

        const err = getClient().permManager.checkName(g_name);

        if (err) {
            return ":warning: " + err;
        }

        level = Util.parseInt(level);

        if (perm < level) {
            return `:warning: Can't create a group with a level that is higher than your own. (**${level}** > **${perm}**)`;
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

        return `:white_check_mark: Added group **${g_name}** with level **${level}**.`;
    }
};
