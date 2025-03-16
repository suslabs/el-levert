import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "add",
    aliases: ["give"],
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,

    handler: async (args, msg) => {
        const [g_name, u_name] = Util.splitArgs(args);

        if (Util.empty(args) || Util.empty(g_name) || Util.empty(u_name)) {
            return ":information_source: `perm add [group name] [ping/id/username]`";
        }

        const err = getClient().permManager.checkName(g_name);

        if (err) {
            return ":warning: " + err;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        const maxLevel = await getClient().permManager.maxLevel(msg.author.id);

        if (maxLevel < group.level) {
            return `:warning: Can't add a user to a group with a higher level your own. (${maxLevel} < ${group.level})`;
        }

        const find = Util.first(await getClient().findUsers(u_name));

        if (typeof find === "undefined") {
            return `:warning: User \`${u_name}\` not found.`;
        }

        if (await getClient().permManager.isInGroup(g_name, find.id)) {
            return `:warning: User \`${find.user.username}\` is already a part of the group **${g_name}**.`;
        }

        try {
            await getClient().permManager.add(group, find.user.id);
        } catch (err) {
            if (err.name === "PermissionError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Added user \`${find.user.username}\` (${find.user.id}) to group **${g_name}**.`;
    }
};
