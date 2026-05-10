import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

const leaderboardTypes = ["count", "size", "usage"];
const defaultLimit = 10,
    maxLimit = 50;

function formatLeaderboard(leaderboard, type) {
    return leaderboard
        .map((entry, i) => {
            let str;

            switch (type) {
                case "count":
                case "size":
                    str = `${i + 1}. \`${entry.user.username}\`: `;
                    break;
                case "usage":
                    str = `${i + 1}. \`${entry.name}${entry.exists ? "" : "*"}\`: `;
                    break;
            }

            switch (type) {
                case "count":
                    str += `**${Util.formatNumber(entry.count)}** tag${entry.count > 1 ? "s" : ""}`;
                    break;
                case "size":
                    str += `**${Util.formatNumber(entry.quota, 2)}** kb`;
                    break;
                case "usage":
                    str += `**${Util.formatNumber(entry.count)}** use${entry.count > 1 ? "s" : ""}`;
                    break;
            }

            return str;
        })
        .join("\n");
}

class TagLeaderboardCommand {
    static info = {
        name: "leaderboard",
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "leaderboardType",
                parser: "split",
                index: 0,
                lowercase: true
            },
            {
                name: "limitText",
                parser: "split",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp(`(count/size/usage) [limit <= ${maxLimit}]`)}`;
        }

        const l_type = ctx.arg("leaderboardType"),
            l_text = ctx.arg("limitText");

        if (!leaderboardTypes.includes(l_type)) {
            return `${getEmoji("warn")} Invalid leaderboard type.`;
        }

        let maxUsers = defaultLimit;

        if (!Util.empty(l_text)) {
            maxUsers = Util.parseInt(l_text);

            if (Number.isNaN(maxUsers) || maxUsers < 1) {
                return `${getEmoji("warn")} Invalid limit: ${l_text}`;
            }

            maxUsers = Util.clamp(maxUsers, 1, maxLimit);
        }

        const leaderboard = await getClient().tagManager.leaderboard(l_type, maxUsers);

        if (Util.empty(leaderboard)) {
            return `${getEmoji("info")} There are **no** tags registered.`;
        }

        return {
            content: `${getEmoji("info")} Tag ${l_type} leaderboard:`,
            embeds: [new EmbedBuilder().setDescription(formatLeaderboard(leaderboard, l_type))]
        };
    }
}

export default TagLeaderboardCommand;
