import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermAddCommand {
    static info = {
        name: "add",
        aliases: ["give"],
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
                name: "userName",
                parser: "split",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        let g_name = ctx.arg("groupName"),
            u_name = ctx.arg("userName");

        if (Util.empty(ctx.argsText) || Util.empty(g_name) || Util.empty(u_name)) {
            return `${getEmoji("info")} ${this.getArgsHelp("group_name (ping/id/username)")}`;
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
        } else if (!getClient().permManager.allowed(ctx.perm, group.level)) {
            return `${getEmoji("warn")} Can't add a user to a group with a higher level your own. (**${ctx.perm}** < **${group.level}**)`;
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            return `${getEmoji("warn")} User \`${u_name}\` not found.`;
        } else if (await getClient().permManager.isInGroup(g_name, find.id)) {
            return `${getEmoji("warn")} User \`${find.user.username}\` (\`${find.user.id}\`) is already a part of the group **${escapeMarkdown(g_name)}**.`;
        }

        try {
            await getClient().permManager.add(group, find.user.id);
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Added user \`${find.user.username}\` (\`${find.user.id}\`) to group **${escapeMarkdown(g_name)}**.`;
    }
}

export default PermAddCommand;
