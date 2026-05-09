import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class PermRemoveAllCommand {
    static info = {
        name: "remove_all",
        aliases: ["take"],
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        arguments: [
            {
                name: "userName",
                parser: "split",
                index: 0
            }
        ]
    };

    async handler(ctx) {
        const u_name = ctx.arg("userName");

        if (Util.empty(ctx.argsText) || Util.empty(u_name)) {
            return `${getEmoji("info")} ${this.getArgsHelp("(ping/id/username)")}`;
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            if (getClient().permManager.isOwner(ctx.msg.author.id)) {
                let out = `${getEmoji("warn")} User \`${u_name}\` not found. Tried removing by verbatim input: \`${u_name}\``,
                    removed = await getClient().permManager.removeAll(u_name);

                if (!removed) {
                    out += "\nUser doesn't have any permissions.";
                }

                return out;
            }

            return `${getEmoji("warn")} User \`${u_name}\` not found.`;
        }

        const theirLevel = await getClient().permManager.maxLevel(find.user.id);

        if (!getClient().permManager.allowed(ctx.perm, theirLevel)) {
            return `${getEmoji("warn")} Can't remove permissions of a user (\`${find.user.username}\` \`${find.user.id}\`) with a level higher than your own. (**${ctx.perm}** < **${theirLevel}**)`;
        }

        const removed = await getClient().permManager.removeAll(find.user.id);

        if (!removed) {
            const out = `${getEmoji("info")} User \`${find.user.username}\` (\`${find.user.id}\`) doesn't have any permissions`,
                findIsOwner = getClient().permManager.isOwner(find.user.id);

            return out + (findIsOwner ? " other than being the bot owner." : ".");
        }

        return `${getEmoji("ok")} Removed \`${find.user.username}\`'s (\`${find.user.id}\`) permissions.`;
    }
}

export default PermRemoveAllCommand;
