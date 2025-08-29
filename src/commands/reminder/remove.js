import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "remove",
    aliases: ["unset", "delete"],
    parent: "reminder",
    subcommand: true,

    handler: async function (args, msg) {
        let index = Util.parseInt(args) - 1;

        if (Util.empty(args) || Number.isNaN(index)) {
            return `:information_source: ${this.getArgsHelp("index")}`;
        }

        {
            let err;
            [index, err] = getClient().reminderManager.checkIndex(index, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        let removed = false;

        try {
            const reminder = await getClient().reminderManager.remove(msg.author.id, index);
            removed = reminder !== null;
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Reminder doesn't exist":
                    return `:warning: Reminder **${index}** doesn't exist.`;
                default:
                    return `:warning: ${err.message}.`;
            }
        }

        return `:information_source: ${removed ? `Removed reminder **${index}**.` : "You don't have any reminders."}`;
    }
};
