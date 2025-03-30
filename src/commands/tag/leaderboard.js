import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const leaderboardTypes = ["count", "size"];

const defaultLimit = 10,
    maxLimit = 50;

function formatLeaderboard(leaderboard, type) {
    const format = leaderboard.map((entry, i) => {
        let str = `${i + 1}. \`${entry.user.username}\`: `;

        switch (type) {
            case "count":
                const s = entry.count > 1 ? "s" : "";
                str += `**${Util.formatNumber(entry.count)}** tag${s}`;

                break;
            case "size":
                str += `**${Util.formatNumber(entry.quota, 2)}** kb`;
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

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp(`(count/size) [limit <= ${maxLimit}]`)}`;
        }

        const [l_type, l_str] = Util.splitArgs(args, true);

        if (!leaderboardTypes.includes(l_type)) {
            return ":warning: Invalid leaderboard type.";
        }

        let maxUsers = defaultLimit;

        if (!Util.empty(l_str)) {
            maxUsers = Util.parseInt(l_str);

            if (Number.isNaN(maxUsers) || maxUsers < 1) {
                return ":warning: Invalid limit: " + l_str;
            }

            maxUsers = Util.clamp(maxUsers, 1, maxLimit);
        }

        const leaderboard = await getClient().tagManager.leaderboard(l_type, maxUsers);

        if (Util.empty(leaderboard)) {
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
