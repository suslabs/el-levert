import { EmbedBuilder } from "discord.js";

import { getEmoji } from "../../LevertClient.js";

function formatNames(langNames) {
    const format = Object.entries(langNames).map((entry, i) => {
        const [key, name] = entry;
        return `${i + 1}. ${key} - **${name}**`;
    });

    return format.join("\n");
}

class EvalLangsCommand {
    static info = {
        name: "langs",
        description: "List the available evaluation languages.",
        parent: "eval",
        subcommand: true
    };

    handler() {
        const format = formatNames(this.parentCmd.langNames),
            embed = new EmbedBuilder().setDescription(format);

        return {
            content: `${getEmoji("info")} Supported languages:`,
            embeds: [embed]
        };
    }
}

export default EvalLangsCommand;
