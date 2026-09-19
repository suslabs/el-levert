import { getClient, getEmoji } from "../../LevertClient.js";

class ReminderRemoveCommand {
    static info = {
        name: "remove",
        description: "Remove one of your reminders.",
        aliases: ["unset", "delete"],
        parent: "reminder",
        subcommand: true,
        arguments: [
            {
                name: "index",
                from: "argsText",
                type: "integer",
                required: true,
                valid: {
                    min: 1
                }
            }
        ]
    };

    async handler(ctx) {
        const idxRes = ctx.arg("index", { validate: true });

        if (!idxRes.valid) {
            return `${getEmoji("info")} ${this.getArgsHelp("index")}`;
        }

        let index = idxRes.value - 1;

        {
            let err;
            [index, err] = getClient().reminderManager.checkIndex(index, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let removed = false;

        try {
            const reminder = await getClient().reminderManager.remove(ctx.msg.author.id, index);
            removed = reminder !== null;
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Reminder doesn't exist":
                    return `${getEmoji("warn")} Reminder **${index}** doesn't exist.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        return `${getEmoji("info")} ${removed ? `Removed reminder **${index}**.` : "You don't have any reminders."}`;
    }
}

export default ReminderRemoveCommand;
