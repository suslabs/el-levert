import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermRemoveGroupCommand {
    static info = {
        name: "remove_group",
        description: "Delete a permission group.",
        aliases: ["delete", "delete_group"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        arguments: [
            {
                name: "groupName",
                kind: "positional",
                index: 0
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("group_name")}`;
        }

        let g_name = ctx.arg("groupName");

        {
            let err;
            [g_name, err] = getClient().permManager.checkName(g_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (group === null) {
            return `${getEmoji("warn")} Group **${g_name}** doesn't exist.`;
        }

        {
            const err = this.parentCmd.checkLevel(ctx, group.level, "remove a group", {
                pronoun: "yours"
            });

            if (err !== null) {
                return err;
            }
        }

        try {
            await getClient().permManager.removeGroup(group, false, {
                actor: ctx.msg.author.id
            });
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Removed group **${escapeMarkdown(g_name)}** and all of its users.`;
    }
}

export default PermRemoveGroupCommand;
