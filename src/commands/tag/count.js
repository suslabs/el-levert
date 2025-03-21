import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "count",
    parent: "tag",
    subcommand: true,

    handler: async (args, msg) => {
        let user;

        let all = false,
            own = false;

        findUser: if (!Util.empty(args)) {
            const [u_name] = Util.splitArgs(args),
                lowercaseName = u_name.toLowerCase();

            all = lowercaseName === "all";
            own = lowercaseName === "me";

            if (all) {
                break findUser;
            } else if (own) {
                user = msg.author;
            } else {
                const find = Util.first(await getClient().findUsers(u_name));

                if (typeof find === "undefined") {
                    return `:warning: User \`${u_name}\` not found.`;
                }

                user = find.user;
            }
        }

        const count = await getClient().tagManager.count(user?.id),
            registered = count > 0 ? count.toLocaleString() : "no";

        if (own) {
            return `:information_source: You have **${registered}** tags.`;
        } else if (typeof user !== "undefined") {
            return `:information_source: User \`${user.username}\` has **${registered}** tags.`;
        } else {
            return `:information_source: There are **${registered}** tags registered.`;
        }
    }
};
