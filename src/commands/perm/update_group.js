import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermUpdateGroupCommand {
    static info = {
        name: "update_group",
        aliases: ["edit", "edit_group"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        args: "<group_name> <new_name|unchanged> <new_level|unchanged>",
        description:
            "Update the name, permission level, or both for an existing permission group. Pass 'unchanged' to preserve existing values.",
        usage: "- <group_name>: Name of the permission group to update.\n- <new_name|unchanged>: New name for the group, or 'unchanged'.\n- <new_level|unchanged>: New permission level, or 'unchanged'.",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "groupName",
                kind: "positional",
                index: 0
            },
            {
                name: "groupData",
                kind: "rest"
            },
            {
                name: "newNameText",
                from: "groupData",
                kind: "positional",
                index: 0
            },
            {
                name: "newLevelText",
                from: "groupData",
                kind: "positional",
                index: 1
            },
            {
                name: "newLevel",
                from: "newLevelText"
            }
        ]
    };

    async handler(ctx) {
        let g_name = ctx.arg("groupName"),
            g_data = ctx.arg("groupData");

        if (Util.empty(g_name) || Util.empty(g_data)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        {
            let err;
            [g_name, err] = getClient().permManager.checkName(g_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (group === null) {
            return `${getEmoji("warn")} Group **${escapeMarkdown(g_name)}** doesn't exist.`;
        }

        {
            const err = this.parentCmd.checkLevel(ctx, group.level, "update a group");

            if (err !== null) {
                return err;
            }
        }

        let newName = ctx.arg("newNameText"),
            newLevel = ctx.arg("newLevel"),
            newLevelText = ctx.arg("newLevelText");

        if (this.parentCmd.isUnchanged(newName)) {
            newName = null;
        } else {
            let err;
            [newName, err] = getClient().permManager.checkName(newName, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (this.parentCmd.isUnchanged(newLevelText)) {
            newLevel = null;
        } else {
            newLevel = Number(newLevel);

            let err;
            [newLevel, err] = getClient().permManager.checkLevel(newLevel, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (newName === null && newLevel === null) {
            return `${getEmoji("warn")} No group changes provided.`;
        }

        if (newLevel !== null) {
            const err = this.parentCmd.checkLevel(ctx, newLevel, "update a group", {
                connector: "to have"
            });

            if (err !== null) {
                return err;
            }
        }

        try {
            await getClient().permManager.updateGroup(
                group,
                newName,
                newLevel,
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

        return `${getEmoji("ok")} Updated group **${escapeMarkdown(g_name)}**.`;
    }
}
export default PermUpdateGroupCommand;
