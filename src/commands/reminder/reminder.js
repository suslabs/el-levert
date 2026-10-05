import { getConfig, getEmoji } from "../../LevertClient.js";

class ReminderCommand {
    static info = {
        name: "reminder",
        aliases: ["r"],
        args: "<subcommand> [args]",
        description: "Manage personal reminders. Set timed notifications to be delivered to you in Discord.",
        usage: "- <subcommand>: Reminder management operation to execute.",
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
