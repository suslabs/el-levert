import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const leaderboardTypes = ["count", "size"],
    defaultUserLimit = 10;

function formatLeaderboard(leaderboard, type) {
    const format = leaderboard.map((entry, i) => {
        let str = `${i + 1}. \`${entry.user.username}\`: `;

        switch (type) {
            case "count":
                const s = entry.count > 1 ? "s" : "";
                str += `${entry.count} tag${s}`;

                break;
            case "size":
                const quota = Util.round(entry.quota, 3);
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

        const [l_type, l_str] = Util.splitArgs(args, true);

        if (!leaderboardTypes.includes(l_type)) {
            return ":warning: Invalid leaderboard type.";
        }

        let maxUsers = defaultUserLimit;

        if (l_str.length > 0) {
            maxUsers = Util.parseInt(l_str);

            if (Number.isNaN(maxUsers) || maxUsers < 1) {
                return ":warning: Invalid limit: " + l_str;
            }

            maxUsers = Util.clamp(maxUsers, 1, 100);
        }

        const leaderboard = await getClient().tagManager.leaderboard(l_type, maxUsers);

        if (leaderboard.length < 1) {
            return ":information_source: There are no tags registered.";
        }

        const format = formatLeaderboard(leaderboard, l_type),
            embed = new EmbedBuilder().setDescription(format);

        return {
            content: `:information_source: Tag ${l_type} leaderboard:`,
            embeds: [embed]
        };
    }
};
