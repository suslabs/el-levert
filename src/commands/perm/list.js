import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

function formatGroups(groups) {
    const format = groups.map((group, i) => `${i + 1}\\. ${group.formatUsers(true, true)}`);
    return format.join("\n");
}

class PermListCommand {
    static info = {
        name: "list",
        parent: "perm",
        subcommand: true
    };

    async handler() {
        const groups = await getClient().permManager.listGroups(true);

        if (groups === null) {
            return `${getEmoji("info")} **No** permissions are registered.`;
        }

        const format = formatGroups(groups),
            embed = new EmbedBuilder().setDescription(format);

        return {
            content: `${getEmoji("info")} Registered permissions:`,
            embeds: [embed]
        };
    }
}

export default PermListCommand;
