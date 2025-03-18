import { getClient } from "../../LevertClient.js";

export default {
    name: "reminder",
    aliases: ["r"],
    subcommands: ["add", "list", "remove", "remove_all"],

    load: _ => getClient().config.enableReminders,

    handler: function (_1, _2, perm) {
        return `:information_source: ${this.getSubcmdHelp(perm)}`;
    }
};
