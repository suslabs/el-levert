import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "add",
    aliases: ["give"],
    parent: "perm",
    subcommand: true,
    allowed: "admin",

    handler: async function (args, msg, perm) {
        let [g_name, u_name] = ParserUtil.splitArgs(args);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(u_name)) {
            return `:information_source: ${this.getArgsHelp("group_name (ping/id/username)")}`;
        }

        {
            let err;
            [g_name, err] = getClient().permManager.checkName(g_name, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (group === null) {
            return `:warning: Group **${escapeMarkdown(g_name)}** doesn't exist.`;
        } else if (!getClient().permManager.allowed(perm, group.level)) {
            return `:warning: Can't add a user to a group with a higher level your own. (**${perm}** < **${group.level}**)`;
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            return `:warning: User \`${u_name}\` not found.`;
        } else if (await getClient().permManager.isInGroup(g_name, find.id)) {
            return `:warning: User \`${find.user.username}\` (\`${find.user.id}\`) is already a part of the group **${escapeMarkdown(g_name)}**.`;
        }

        try {
            await getClient().permManager.add(group, find.user.id);
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            return `:warning: ${err.message}.`;
        }

        return `:white_check_mark: Added user \`${find.user.username}\` (\`${find.user.id}\`) to group **${escapeMarkdown(g_name)}**.`;
    }
};
