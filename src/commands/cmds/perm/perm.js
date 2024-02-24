import { getClient } from "../../../LevertClient.js";

export default {
    name: "perm",
    aliases: ["p"],
    subcommands: ["add", "remove", "list", "add_group", "remove_group", "check"],
    load: _ => getClient().config.enablePermissions,
    handler: async function (args, msg) {
        return `:information_source: %perm [${this.subcommands.join("|")}]`;
    }
};
