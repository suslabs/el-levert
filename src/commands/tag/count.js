import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "count",
    parent: "tag",
    subcommand: true,

    handler: async (args, msg) => {
        let user;

        let all = false,
            newTags = false,
            scriptTags = false,
            own = false;

        findUser: if (!Util.empty(args)) {
            const [u_name] = Util.splitArgs(args, true);

            all = u_name === "all";
            newTags = u_name === "new";
            scriptTags = u_name === "script";
            own = u_name === "me";

            if (all || newTags || scriptTags) {
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

        const flags = [newTags ? "new" : null, scriptTags ? "script" : null],
            count = await getClient().tagManager.count(user?.id, flags);

        const registered = count > 0 ? Util.formatNumber(count) : "no",
            tags = "tag" + (count > 1 ? "s" : "");

        if (own) {
            return `:information_source: You have **${registered}** ${tags}.`;
        } else if (typeof user !== "undefined") {
            return `:information_source: User \`${user.username}\` has **${registered}** ${tags}.`;
        } else {
            const are = count === 1 ? "is" : "are";

            const flagName = Util.first(flags.filter(name => name !== null)),
                areType = flagName ? flagName + " " : "";

            return `:information_source: There ${are} **${registered}** ${areType}${tags} registered.`;
        }
    }
};
