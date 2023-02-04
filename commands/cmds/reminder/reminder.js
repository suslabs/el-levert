import { getClient } from "../../../LevertClient.js";

export default {
    name: "reminder",
    subcommands: [
        "add",
        "list",
        "remove",
        "removeall"
    ],
    handler: async function(args, msg) {
        if(!getClient().config.enableReminders) {
            return ":warning: Reminders are disabled.";
        }

        return `:information_source: %reminder [${this.subNames.join("|")}]`;
    }
}