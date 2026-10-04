import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermAddGroupCommand {
    static info = {
        name: "add_group",
        description: "Create a permission group.",
        aliases: ["create", "create_group"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        arguments: [
            {
                name: "groupName",
                kind: "positional",
                index: 0
            },
            {
                name: "levelText",
                kind: "positional",
                index: 1
            },
            {
                name: "level",
                from: "levelText",
                type: "number"
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

        {
            const err = this.parentCmd.checkLevel(ctx, level, "create a group");

            if (err !== null) {
                return err;
            }
        }

        try {
            await getClient().permManager.addGroup(
                g_name,
                level,
                {
                    validateNew: false
                },
                {
                    actor: ctx.msg.author.id
                }
            );
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
