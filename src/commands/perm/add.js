import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "add",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,
    handler: async (args, msg) => {
        const [g_name, u_name] = Util.splitArgs(args);

        if (args.length === 0 || g_name.length === 0 || u_name.length === 0) {
            return ":information_source: `perm add [group name] [ping/id/username]`";
        }

        const e = getClient().permManager.checkName(g_name);
        if (e) {
            return ":warning: " + e;
        }

        const group = await getClient().permManager.fetchGroup(g_name);

        if (!group) {
            return `:warning: Group **${g_name}** doesn't exist.`;
        }

        const find = (await getClient().findUsers(u_name))[0];

        if (typeof find === "undefined") {
            return `:warning: User \`${u_name}\` not found.`;
        }

        const maxLevel = await getClient().permManager.maxLevel(msg.author.id);

        if (group.level > maxLevel) {
            return `:warning: Can't a user to a group that is higher than your own. (${maxLevel} -> ${group.level})`;
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
