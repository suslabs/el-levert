import { getConfig, getEmoji } from "../../LevertClient.js";

class ReminderCommand {
    static info = {
        name: "reminder",
        aliases: ["r"],
        subcommands: ["add", "list", "remove", "remove_all"]
    };

    load() {
        return getConfig().enableReminders;
    }

    handler(ctx) {
        return `${getEmoji("info")} ${this.getSubcmdHelp(ctx.perm)}`;
    }
}

export default ReminderCommand;
