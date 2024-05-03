import { getClient } from "../../LevertClient.js";

export default {
    name: "remove",
    aliases: ["delete"],
    parent: "reminder",
    subcommand: true,
    handler: async (args, msg) => {
        const index = parseInt(args, 10);

        if (args.length <= 0 || isNaN(index)) {
            return ":information_source: `reminder remove [index]`";
        }

        let res = false;

        try {
            res = await getClient().reminderManager.remove(msg.author.id, index - 1);
        } catch (err) {
            if (err.name === "ReminderError") {
                switch (err.message) {
                    case "Reminder doesn't exist":
                        return `:warning: Reminder **${index}** doesn't exist.`;
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        if (!res) {
            return ":information_source: You don't have any reminders.";
        }

        return `:information_source: Removed reminder **${index}**.`;
    }
};
