import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import { validUnchangedArgs } from "./UnchangedArgs.js";

class PermUpdateGroupCommand {
    static info = {
        name: "update_group",
        description: "Update a permission group's name or level.",
        aliases: ["edit", "edit_group"],
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

        if (Util.empty(ctx.argsText) || Util.empty(g_name) || Util.empty(g_data)) {
            return `${getEmoji("info")} ${this.getArgsHelp("group_name (new_name/unchanged) (new_level/unchanged)")}`;
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
        } else if (!getClient().permManager.canManageLevel(ctx.perm, group.level)) {
            return `${getEmoji("warn")} Can't update a group with a level that is higher than or equal to your own. (**${ctx.perm}** <= **${group.level}**)`;
        }

        let newName = ctx.arg("newNameText"),
            newLevel = ctx.arg("newLevel"),
            newLevelText = ctx.arg("newLevelText");

        if (validUnchangedArgs.has(newName)) {
            newName = null;
        } else {
            let err;
            [newName, err] = getClient().permManager.checkName(newName, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (validUnchangedArgs.has(newLevelText)) {
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

        if (newLevel !== null && !getClient().permManager.canManageLevel(ctx.perm, newLevel)) {
            return `${getEmoji("warn")} Can't update a group to have a level that is higher than or equal to your own. (**${ctx.perm}** <= **${newLevel}**)`;
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
