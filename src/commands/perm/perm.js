import { getClient } from "../../LevertClient.js";

export default {
    name: "perm",
    aliases: ["p"],
    subcommands: ["add", "remove", "remove_all", "list", "add_group", "remove_group", "update_group", "check"],

    load: _ => getClient().config.enablePermissions,

    handler: function (_1, _2, perm) {
        return `:information_source: ${this.getSubcmdHelp(perm)}`;
    }
};
