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
        args: "<group_name> <user>",
        description: "Assign a user to an existing permission group.",
        usage: "- <group_name>: Name of the permission group.\n- <user>: Target user by mention, username, or Discord ID.",
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
                name: "userName",
                kind: "positional",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        let g_name = ctx.arg("groupName"),
            u_name = ctx.arg("userName");

        if (Util.empty(g_name) || Util.empty(u_name)) {
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
            const err = this.parentCmd.checkLevel(ctx, group.level, "add a user to a group");

            if (err !== null) {
                return err;
            }
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            return `${getEmoji("warn")} User \`${u_name}\` not found.`;
        } else if (await getClient().permManager.isInGroup(g_name, find.id)) {
            return `${getEmoji("warn")} User \`${find.user.username}\` (\`${find.user.id}\`) is already a part of the group **${escapeMarkdown(g_name)}**.`;
        }

        try {
            await getClient().permManager.add(group, find.user.id, false, {
                actor: ctx.msg.author.id
            });
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
