import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

function formatGroups(groups) {
    let format;

    if (Util.multiple(groups)) {
        format = groups.map((group, i) => `${i + 1}. ${group.format()}`);
        format = format.join("\n");
    } else {
        format = Util.first(groups).format();
    }

    return format;
}

export default {
    name: "check",
    parent: "perm",
    subcommand: true,

    handler: async (args, msg) => {
        let user = msg.author;

        if (!Util.empty(args)) {
            const [u_name] = Util.splitArgs(args),
                find = Util.first(await getClient().findUsers(u_name));

            if (typeof find === "undefined") {
                user = {
                    id: u_name,
                    username: u_name
                };
            } else {
                user = find.user;
            }
        }

        const groups = await getClient().permManager.fetch(user.id);

        if (groups === null) {
            if (user === msg.author) {
                return `:information_source: You have no permissions.`;
            } else {
                return `:information_source: User \`${user.username}\` has no permissions.`;
            }
        }

        const format = formatGroups(groups),
            maxLevel = await getClient().permManager.maxLevel(user.id);

        let out = `\`\`\`
${format}
\`\`\`
Level: ${maxLevel}`;

        if (user === msg.author) {
            out = `:information_source: You have the following permissions:` + out;
        } else {
            out = `:information_source: User \`${user.username}\` has the following permissions:` + out;
        }

        return out;
    }
};
