import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const unchangedArgs = ["", "unchanged"];

class PermUpdateGroupCommand {
    static info = {
        name: "update_group",
        aliases: ["edit", "edit_group"],
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
                name: "groupData",
                parser: "split",
                index: 1
            },
            {
                name: "newNameText",
                from: "groupData",
                parser: "split",
                index: 0
            },
            {
                name: "newLevelText",
                from: "groupData",
                parser: "split",
                index: 1
            },
            {
                name: "newLevel",
                from: "newLevelText",
                transform: "int"
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
        }

        let newName = ctx.arg("newNameText"),
            newLevel = ctx.arg("newLevel"),
            newLevelText = ctx.arg("newLevelText");

        if (unchangedArgs.includes(newName)) {
            newName = null;
        } else {
            let err;
            [newName, err] = getClient().permManager.checkName(newName, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (unchangedArgs.includes(newLevelText)) {
            newLevel = null;
        } else {
            let err;
            [newLevel, err] = getClient().permManager.checkLevel(newLevel, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (newName === null && newLevel === null) {
            return `${getEmoji("warn")} No group changes provided.`;
        }

        if (newLevel !== null && !getClient().permManager.allowed(ctx.perm, newLevel)) {
            return `${getEmoji("warn")} Can't update a group to have a level that is higher than your own. (**${ctx.perm}** < **${newLevel}**)`;
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
                    return `${getEmoji("warn")} Group **${escapeMarkdown(g_name)}** already exists.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        return `${getEmoji("ok")} Updated group **${escapeMarkdown(g_name)}**.`;
    }
}

export default PermUpdateGroupCommand;
