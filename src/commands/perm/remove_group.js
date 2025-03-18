import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "remove_group",
    aliases: ["delete", "delete_group"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async function (args, msg) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("group_name")}`;
        }

        const [g_name] = Util.splitArgs(args);

        const err = getClient().permManager.checkName(g_name);

        if (err) {
            return ":warning: " + err;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        const maxLevel = await getClient().permManager.maxLevel(msg.author.id);

        if (maxLevel < group.level) {
            return `:warning: Can't remove a group with a level that is higher than yours. (${maxLevel} < ${group.level})`;
        }

        try {
            await getClient().permManager.removeGroup(group);
        } catch (err) {
            if (err.name === "PermissionError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Removed group **${g_name}** and all of it's users.`;
    }
};
