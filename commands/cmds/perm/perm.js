import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "perm",
    aliases: ["p"],
    subcommands: [
        "add",
        "remove",
        "list",
        "addgroup",
        "removegroup",
        "check"
    ],
    handler: async function(args, msg) {
        return `:information_source: %perm [${this.subcommands.join("|")}]`;
    }
}