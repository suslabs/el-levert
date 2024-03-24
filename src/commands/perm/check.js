import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

function formatGroups(groups) {
    let format;

    if (groups.length > 1) {
        format = groups.map((group, i) => `${i + 1}. ${group.format()}`).join("\n");
    } else {
        format = groups[0].format();
    }

    return format;
}

export default {
    name: "check",
    parent: "perm",
    subcommand: true,
    allowed: getClient().permManager.adminLevel,
    handler: async args => {
        if (args.length === 0) {
            return ":information_source: `perm check [username]`";
        }

        const [u_name] = Util.splitArgs(args);

        let find = (await getClient().findUsers(u_name))[0],
            user;

        if (typeof find !== "undefined") {
            user = find.user;
        } else {
            user = {
                id: u_name,
                username: u_name
            };
        }

        const groups = await getClient().permManager.fetch(user.id);

        if (!groups) {
            return `:information_source: User \`${user.username}\` has no permissions.`;
        }

        const format = formatGroups(groups),
            maxLevel = await getClient().permManager.maxLevel(user.id);

        return `User \`${user.username}\` has permissions:
\`\`\`
${format}
\`\`\`
Level: ${maxLevel}`;
    }
};
