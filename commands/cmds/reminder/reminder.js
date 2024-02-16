import { getClient } from "../../../LevertClient.js";

export default {
    name: "reminder",
    aliases: ["r"],
    subcommands: ["add", "list", "remove", "remove_all"],
    load: _ => getClient().config.enableReminders,
    handler: async function (args, msg) {
        return `:information_source: %reminder [${this.subcommands.join("|")}]`;
    }
};
