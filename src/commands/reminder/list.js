import { EmbedBuilder, bold } from "discord.js";

import { getClient } from "../../LevertClient.js";

function formatReminders(reminders) {
    return reminders
        .map((reminder, i) => {
            let out = `${i + 1}. `;
            out += reminder.getTimestamp();

            if (reminder.msg.length > 0) {
                out += `: ${bold(reminder.msg)}`;
            }

            return out;
        })
        .join("\n");
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

        const reminders = await getClient().reminderManager.fetch(owner);

        if (typeof reminders === "undefined") {
            if (owner === msg.author.id) {
                return ":information_source: You have no reminders.";
            }

            return `:information_source: \`${username}\` has no reminders.`;
        }

        const format = formatReminders(reminders),
            embed = new EmbedBuilder().setDescription(format);

        let out = {};
        if (owner === msg.author.id) {
            out.content = ":information_source: Your Reminders:";
        } else {
            out.content = `:information_source: \`${username}\`'s reminders:`;
        }

        out.embeds = [embed];
        return out;
    }
};
