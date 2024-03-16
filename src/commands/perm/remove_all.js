import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "remove_all",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,
    handler: async args => {
        const [u_name] = Util.splitArgs(args);

        if (args.length === 0 || u_name.length === 0) {
            return ":information_source: `perm remove_all [ping/id/username]`";
        }

        const find = (await getClient().findUsers(u_name))[0];

        if (typeof find === "undefined") {
            let out = `:warning: User \`${u_name}\` not found. Tried removing by verbatim input: \`${u_name}\``,
                removed = await getClient().permManager.removeAll(u_name);

            if (!removed) {
                out += `\nUser doesn't have any permissions.`;
            }

            return out;
        }

        const removed = await getClient().permManager.removeAll(find.user.id);

        if (!removed) {
            return `:information_source: User \`${find.user.username}\` doesn't have any permissions.`;
        }

        return `:white_check_mark: Removed \`${find.user.username}\`'s permissions.`;
    }
};
