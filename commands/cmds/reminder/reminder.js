import { getClient } from "../../../LevertClient.js";

export default {
    name: "reminder",
    subcommands: [
        "add",
        "list",
        "remove",
        "removeall"
    ],
    load: _ => getClient().config.enableReminders,
    handler: async function(args, msg) {
        return `:information_source: %reminder [${this.subNames.join("|")}]`;
    }
}