import { EmbedBuilder } from "discord.js";

function formatNames(langNames) {
    const format = Object.entries(langNames).map((entry, i) => {
        const [key, name] = entry;
        return `${i + 1}. ${key} - **${name}**`;
    });

    return format.join("\n");
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
