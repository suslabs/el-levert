import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "remove_group",
    aliases: ["delete", "delete_group"],
    parent: "perm",
    subcommand: true,
    allowed: "admin",

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("group_name")}`;
        }

        let [g_name] = ParserUtil.splitArgs(args);

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
        } else if (!getClient().permManager.allowed(perm, group.level)) {
            return `:warning: Can't remove a group with a level that is higher than yours. (**${perm}** < **${group.level}**)`;
        }

        try {
            await getClient().permManager.removeGroup(group);
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            return `:warning: ${err.message}.`;
        }

        return `:white_check_mark: Removed group **${escapeMarkdown(g_name)}** and all of its users.`;
    }
};
