import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "remove",
    aliases: ["unset", "delete"],
    parent: "reminder",
    subcommand: true,

    handler: async function (args, msg) {
        const index = Util.parseInt(args);

        if (Util.empty(args) || Number.isNaN(index)) {
            return `:information_source: ${this.getArgsHelp("index")}`;
        }

        let res = false;

        try {
            res = await getClient().reminderManager.remove(msg.author.id, index - 1);
        } catch (err) {
            if (err.name === "ReminderError") {
                if (err.message === "Reminder doesn't exist") {
                    return `:warning: Reminder **${index}** doesn't exist.`;
                } else {
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
