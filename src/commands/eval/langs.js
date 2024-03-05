import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

function formatNames(langNames) {
    const format = Object.keys(langNames)
        .map((x, i) => `${i + 1}. ${x} - **${langNames[x]}**`)
        .join("\n");

    return format;
}

export default {
    name: "langs",
    parent: "eval",
    subcommand: true,
    handler: function () {
        const format = formatNames(this.parentCmd.langNames),
            embed = new EmbedBuilder().setDescription(format);

        const out = {
            content: ":information_source: Supported languages:",
            embeds: [embed]
        };

        return out;
    }
};
