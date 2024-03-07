import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

function formatGroups(groups) {
    const format = groups
        .map(
            (x, i) =>
                `${i + 1}. ${x.name} - Level ${x.level} - User(s):\n` +
                (x.users.length > 0
                    ? x.users.map((y, j) => `    ${j + 1}. \`${y.username}\` (${y.id})`).join("\n")
                    : "    none")
        )
        .join("\n");

    return format;
}

export default {
    name: "list",
    parent: "perm",
    subcommand: true,
    handler: async _ => {
        const groups = await getClient().permManager.list();

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
