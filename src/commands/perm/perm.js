import { getConfig, getEmoji } from "../../LevertClient.js";

class PermCommand {
    static info = {
        name: "perm",
        aliases: ["p"],
        subcommands: ["add", "remove", "remove_all", "list", "add_group", "remove_group", "update_group", "check"]
    };

    load() {
        return getConfig().enablePermissions;
    }

    handler(ctx) {
        return `${getEmoji("info")} ${this.getSubcmdHelp(ctx.perm)}`;
    }
}

export default PermCommand;
