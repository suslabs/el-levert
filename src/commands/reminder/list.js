import { getClient } from "../../LevertClient.js";

function formatReminders(reminders) {
    const format = reminders.map((reminder, i) => `${i + 1}. On ` + reminder.format()).join("\n");

    return format;
}

export default {
    name: "list",
    aliases: ["all"],
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        let owner = msg.author.id,
            username = msg.author.username;

        if (args.length > 0) {
            const find = (await getClient().findUsers(args))[0];

            if (typeof find === "undefined") {
                return `:warning: User \`${args}\` not found.`;
            }

            owner = find.user.id;
            username = find.user.username;
        }

        const reminders = await getClient().reminderManager.list(owner);

        if (!reminders) {
            if (owner === msg.author.id) {
                return ":information_source: You have no reminders.";
            }

            return `:information_source: \`${username}\` has no reminders.`;
        }

        let out;

        if (owner === msg.author.id) {
            out = ":information_source: Your Reminders:";
        } else {
            out = `:information_source: \`${username}\`'s reminders:`;
        }

        const format = formatReminders(reminders);

        out += `
\`\`\`
${format}
\`\`\``;

        return out;
    }
};
