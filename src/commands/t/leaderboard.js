import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

function formatLeaderboard(leaderboard, type) {
    const format = leaderboard.map((entry, i) => {
        let str = `${i + 1}. \`${entry.user.username}\`: `;

        switch (type) {
            case "count":
                str += `${entry.count} tags`;
                break;
            case "size":
                const quota = entry.quota.toFixed(3);
                str += `${quota}kb`;
                break;
        }

        return str;
    });

    return format.join("\n");
}

export default {
    name: "leaderboard",
    parent: "tag",
    subcommand: true,
    handler: async args => {
        if (args.length === 0) {
            return ":information_source: `t leaderboard (count/size) [limit < 100]`";
        }

        const [l_type, l_str] = Util.splitArgs(args);

        if (!["count", "size"].includes(l_type)) {
            return ":warning: Invalid leaderboard type.";
        }

        let limit;

        if (l_str.length > 0) {
            limit = parseInt(s_str);

            if (isNaN(space)) {
                return ":warning: Invalid limit: " + l_str;
            }
        }

        const leaderboard = await getClient().tagManager.leaderboard(l_type, limit);

        if (leaderboard.length < 1) {
            return ":information_source: There are no tags registered.";
        }

        const format = formatLeaderboard(leaderboard, l_type),
            embed = {
                title: `Tag ${l_type} leaderboard`,
                description: format
            };

        return {
            embeds: [embed]
        };
    }
};
