import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermRemoveCommand {
    static info = {
        name: "remove",
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        args: "<group_name> <user>",
        description: "Remove a user from an existing permission group.",
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

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            return `${getEmoji("warn")} User \`${u_name}\` not found.`;
        }

        if (group === null) {
            return `${getEmoji("warn")} Group **${escapeMarkdown(g_name)}** doesn't exist.`;
        }

        {
            const action = `remove user \`${find.user.username}\` (\`${find.user.id}\`) from a group`,
                err = this.parentCmd.checkLevel(ctx, group.level, action);

            if (err !== null) {
                return err;
            }
        }

        let removed = false;

        try {
            removed = await getClient().permManager.remove(group, find.user.id, false, {
                actor: ctx.msg.author.id
            });
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        if (removed) {
            return `${getEmoji("ok")} Removed user \`${find.user.username}\` (\`${find.user.id}\`) from group **${escapeMarkdown(g_name)}**.`;
        }

        return `${getEmoji("warn")} User \`${find.user.username}\` (\`${find.user.id}\`) is not in group **${escapeMarkdown(g_name)}**.`;
    }
}

export default PermRemoveCommand;
