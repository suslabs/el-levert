import discord from "discord.js-selfbot-v13";
const { EmbedBuilder } = discord;

import { getClient } from "../../LevertClient.js";

function formatGroups(groups) {
    const format = groups.map((group, i) => `${i + 1}. ${group.formatUsers()}`).join("\n");

    return format;
}

export default {
    name: "list",
    parent: "perm",
    subcommand: true,
    handler: async _ => {
        const groups = await getClient().permManager.listGroups(true);

        if (!groups) {
            return ":information_source: No permissions are registered.";
        }

        const format = formatGroups(groups),
            embed = new EmbedBuilder().setDescription(format);

        const out = {
            content: ":information_source: Registered permissions:",
            embeds: [embed]
        };

        return out;
    }
};
