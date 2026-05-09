import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class ReminderRemoveCommand {
    static info = {
        name: "remove",
        aliases: ["unset", "delete"],
        parent: "reminder",
        subcommand: true,
        arguments: [
            {
                name: "index",
                parser: "value",
                from: "argsText",
                transform: value => Util.parseInt(value) - 1
            }
        ]
    };

    async handler(ctx) {
        let index = ctx.arg("index");

        if (Util.empty(ctx.argsText) || Number.isNaN(index)) {
            return `${getEmoji("info")} ${this.getArgsHelp("index")}`;
        }

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
