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

        const format = formatGroups(groups);

        return `:information_source: Registered permissions:
\`\`\`
${format}
\`\`\``;
    }
};
