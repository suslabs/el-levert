import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermRemoveGroupCommand {
    static info = {
        name: "remove_group",
        aliases: ["delete", "delete_group"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        arguments: [
            {
                name: "groupName",
                parser: "split",
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
        } else if (!getClient().permManager.allowed(ctx.perm, group.level)) {
            return `${getEmoji("warn")} Can't remove a group with a level that is higher than yours. (**${ctx.perm}** < **${group.level}**)`;
        }

        try {
            await getClient().permManager.removeGroup(group);
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
