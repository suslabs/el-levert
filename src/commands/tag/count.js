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

        findUser: if (args.length > 0) {
            const [u_name] = Util.splitArgs(args),
                lowercaseName = u_name.toLowerCase();

            all = lowercaseName === "all";
            own = lowercaseName === "me";

            if (all) {
                break findUser;
            } else if (own) {
                user = msg.author;
            } else {
                const find = Util.firstElement(await getClient().findUsers(u_name));

                if (typeof find === "undefined") {
                    return `:warning: User \`${u_name}\` not found.`;
                }

                user = find.user;
            }
        }

        const count = await getClient().tagManager.count(user?.id);

        if (own) {
            if (count === 0) {
                return `:information_source: You have no tags.`;
            }

            return `:information_source: You have **${count}** tags.`;
        } else if (typeof user !== "undefined") {
            if (count === 0) {
                return `:information_source: User \`${user.username}\` has no tags.`;
            }

            return `:information_source: User \`${user.username}\` has **${count}** tags.`;
        }

        if (count === 0) {
            return ":information_source: There are no tags registered.";
        }

        return `:information_source: There are **${count}** tags registered.`;
    }
};
