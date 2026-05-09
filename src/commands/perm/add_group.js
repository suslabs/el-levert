import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermAddGroupCommand {
    static info = {
        name: "add_group",
        aliases: ["create", "create_group"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        arguments: [
            {
                name: "groupName",
                parser: "split",
                index: 0
            },
            {
                name: "levelText",
                parser: "split",
                index: 1
            },
            {
                name: "level",
                from: "levelText",
                transform: "int"
            }
        ]
    };

    async handler(ctx) {
        let g_name = ctx.arg("groupName"),
            levelText = ctx.arg("levelText"),
            level = ctx.arg("level");

        if (Util.empty(ctx.argsText) || Util.empty(g_name) || Util.empty(levelText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("group_name level")}`;
        }

        {
            let err;
            [g_name, err] = getClient().permManager.checkName(g_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        {
            let err;
            [level, err] = getClient().permManager.checkLevel(level, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (!getClient().permManager.allowed(ctx.perm, level)) {
            return `${getEmoji("warn")} Can't create a group with a level that is higher than your own. (**${ctx.perm}** < **${level}**)`;
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
                    return `${getEmoji("warn")} Group **${escapeMarkdown(g_name)}** already exists.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        return `${getEmoji("ok")} Added group **${escapeMarkdown(g_name)}** with level **${level}**.`;
    }
}

export default PermAddGroupCommand;
