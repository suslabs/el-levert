import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import ObjectUtil from "../../util/ObjectUtil.js";

class PermCommand {
    static info = {
        name: "perm",
        aliases: ["p"],
        args: "<subcommand> [args]",
        description: "Manage users, groups, and permission levels.",
        usage: "- <subcommand>: Permission management operation to execute.",
        subcommands: [
            "add",
            "remove",
            "remove_all",
            "list",
            "add_group",
            "remove_group",
            "update_group",
            "check",
            "audit",
            "audit_clear",
            "revert"
        ]
    };

    static unchangedArgs = Object.freeze({
        empty: "",
        unchanged: "unchanged"
    });

    static validUnchangedArgs = new Set(Object.values(this.unchangedArgs));

    load() {
        return getConfig().enablePermissions;
    }

    checkLevel(ctx, level, action, options) {
        if (level == null) {
            return null;
        }

        options = ObjectUtil.guaranteeObject(options);

        const pronoun = options.pronoun ?? "your own",
            connector = options.connector ?? "with";

        if (!getClient().permManager.canManageLevel(ctx.perm, level)) {
            return `${getEmoji("warn")} Can't ${action} ${connector} a level that is higher than or equal to ${pronoun}. (**${ctx.perm}** <= **${level}**)`;
        }

        return null;
    }

    isUnchanged(arg) {
        return PermCommand.validUnchangedArgs.has(arg);
    }

    handler(ctx) {
        return `${getEmoji("info")} ${this.getSubcmdHelp(ctx.perm)}`;
    }
}

export default PermCommand;
