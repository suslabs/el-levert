import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "add_group",
    aliases: ["create", "create_group"],
    parent: "perm",
    subcommand: true,
    allowed: "admin",

    handler: async function (args, msg, perm) {
        let [g_name, level] = ParserUtil.splitArgs(args);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(level)) {
            return `:information_source: ${this.getArgsHelp("group_name level")}`;
        }

        level = Util.parseInt(level);

        {
            let err;
            [g_name, err] = getClient().permManager.checkName(g_name, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        {
            let err;
            [level, err] = getClient().permManager.checkLevel(level, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        if (!getClient().permManager.allowed(perm, level)) {
            return `:warning: Can't create a group with a level that is higher than your own. (**${perm}** < **${level}**)`;
        }

        try {
            await getClient().permManager.addGroup(g_name, level, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            switch (err.message) {
                case "Group already exists":
                    return `:warning: Group **${escapeMarkdown(g_name)}** already exists.`;
                default:
                    return `:warning: ${err.message}.`;
            }
        }

        return `:white_check_mark: Added group **${escapeMarkdown(g_name)}** with level **${level}**.`;
    }
};
