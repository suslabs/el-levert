import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";

class PermAuditClearCommand {
    static info = {
        name: "audit_clear",
        aliases: ["audit-clear"],
        parent: "perm",
        subcommand: true,
        allowed: "owner",
        ownerOnly: true,
        description: "Clear permission audit history as the owner.",
        arguments: [
            {
                name: "from",
                kind: "option"
            },
            {
                name: "to",
                kind: "option"
            },
            {
                name: "scopeArgs",
                kind: "rest"
            }
        ]
    };

    load() {
        return getConfig().enableAuditLog;
    }

    async handler(ctx) {
        const result = await RevisionAuditUtil.clearAudit(
            ctx,
            getClient().permManager,
            getClient().permManager.isOwner(ctx.msg.author.id),
            null
        );

        if (result.error) {
            return `${getEmoji("warn")} ${result.error}`;
        }

        return `${getEmoji("ok")} Cleared ${result.count} permission audit revision${result.count === 1 ? "" : "s"}.`;
    }
}

export default PermAuditClearCommand;
