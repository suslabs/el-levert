import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class PermRemoveAllCommand {
    static info = {
        name: "remove_all",
        aliases: ["take"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        args: "<user>",
        description: "Revoke all permission groups assigned to a user.",
        usage: "- <user>: Target user by mention, username, or Discord ID.",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "userName",
                kind: "positional",
                index: 0
            }
        ]
    };

    async handler(ctx) {
        const u_name = ctx.arg("userName");

        if (Util.empty(u_name)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            if (getClient().permManager.isOwner(ctx.msg.author.id)) {
                let out = `${getEmoji("warn")} User \`${u_name}\` not found. Tried removing by verbatim input: \`${u_name}\``,
                    removed = await getClient().permManager.removeAll(u_name, {
                        actor: ctx.msg.author.id
                    });

                if (!removed) {
                    out += "\nUser doesn't have any permissions.";
                }

                return out;
            }

            return `${getEmoji("warn")} User \`${u_name}\` not found.`;
        }

        const theirLevel = await getClient().permManager.maxLevel(find.user.id);

        {
            const action = `remove permissions of a user (${DiscordUtil.formatUser(find.user, null, false)})`,
                err = this.parentCmd.checkLevel(ctx, theirLevel, action);

            if (err !== null) {
                return err;
            }
        }

        const removed = await getClient().permManager.removeAll(find.user.id, {
            actor: ctx.msg.author.id
        });

        if (!removed) {
            const out = `${getEmoji("info")} User ${DiscordUtil.formatUser(find.user, null, true)} doesn't have any permissions`,
                findIsOwner = getClient().permManager.isOwner(find.user.id);

            return out + (findIsOwner ? " other than being the bot owner." : ".");
        }

        return `${getEmoji("ok")} Removed ${DiscordUtil.formatUser(find.user, null, true, { possessive: true })} permissions.`;
    }
}

export default PermRemoveAllCommand;
