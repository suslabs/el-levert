import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

function formatGroups(groups) {
    let format;

    if (groups.length > 1) {
        format = groups.map((group, i) => `${i + 1}. ${group.format()}`);
        format = format.join("\n");
    } else {
        format = groups[0].format();
    }

    return format;
}

export default {
    name: "check",
    parent: "perm",
    subcommand: true,
    handler: async (args, msg) => {
        let user = msg.author;

        if (args.length > 0) {
            const [u_name] = Util.splitArgs(args),
                find = (await getClient().findUsers(u_name))[0];

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

        if (!groups) {
            return `:information_source: User \`${user.username}\` has no permissions.`;
        }

        const format = formatGroups(groups),
            maxLevel = await getClient().permManager.maxLevel(user.id);

        let out = `\`\`\`
${format}
\`\`\`
Level: ${maxLevel}`;

        if (user === msg.author) {
            out = `You have the following permissions:` + out;
        } else {
            out = `User \`${user.username}\` has the following permissions:` + out;
        }

        return out;
    }
};
