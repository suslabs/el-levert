import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagCountCommand {
    static info = {
        name: "count",
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "subject",
                parser: "split",
                index: 0,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        let user;

        let all = false,
            newTags = false,
            scriptTags = false,
            own = false;

        findUser: if (!Util.empty(ctx.argsText)) {
            const u_name = ctx.arg("subject");

            all = u_name === "all";
            newTags = u_name === "new";
            scriptTags = u_name === "script";
            own = u_name === "me";

            if (all || newTags || scriptTags) {
                break findUser;
            } else if (own) {
                user = ctx.msg.author;
            } else {
                const find = Util.first(await getClient().findUsers(u_name));

                if (typeof find === "undefined") {
                    return `${getEmoji("warn")} User \`${u_name}\` not found.`;
                }

                user = find.user;
            }
        }

        const flags = [newTags ? "new" : null, scriptTags ? "script" : null],
            count = await getClient().tagManager.count(user?.id, flags);

        const registered = count > 0 ? Util.formatNumber(count) : "no",
            tags = "tag" + (count > 1 ? "s" : "");

        if (own) {
            return `${getEmoji("info")} You have **${registered}** ${tags}.`;
        } else if (typeof user !== "undefined") {
            return `${getEmoji("info")} User \`${user.username}\` has **${registered}** ${tags}.`;
        } else {
            const are = count === 1 ? "is" : "are",
                flagName = Util.first(flags.filter(name => name !== null)),
                areType = flagName ? flagName + " " : "";

            return `${getEmoji("info")} There ${are} **${registered}** ${areType}${tags} registered.`;
        }
    }
}

export default TagCountCommand;
