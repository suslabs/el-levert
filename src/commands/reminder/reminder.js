import { getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class ReminderCommand {
    static minInterval = Util.durationSeconds.minute / Util.durationSeconds.milli;

    static info = {
        name: "reminder",
        aliases: ["r"],
        args: "<subcommand> [args]",
        description: "Manage personal reminders. Set timed notifications to be delivered to you in Discord.",
        usage: "- <subcommand>: Reminder management operation to execute.",
        subcommands: ["add", "edit", "list", "remove", "remove_all", "snooze"]
    };

    load() {
        return getConfig().enableReminders;
    }

    handler(ctx) {
        return `${getEmoji("info")} ${this.getSubcmdHelp(ctx.perm)}`;
    }

    checkInterval(interval) {
        if (typeof interval !== "number" || interval >= ReminderCommand.minInterval) {
            return null;
        }

        const minInterval = Util.duration(ReminderCommand.minInterval, { format: true });
        return `${getEmoji("warn")} Repeat interval must be at least ${minInterval}.`;
    }
}

export default ReminderCommand;
