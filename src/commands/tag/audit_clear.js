import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";

class TagAuditClearCommand {
    static info = {
        name: "audit_clear",
        aliases: ["audit-clear"],
        parent: "tag",
        subcommand: true,
        allowed: "owner",
        ownerOnly: true,
        description: "Clear tag audit history as the owner.",
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
            getClient().tagManager,
            getClient().permManager.isOwner(ctx.msg.author.id),
            null
        );

        if (result.error) {
            return `${getEmoji("warn")} ${result.error}`;
        }

        return `${getEmoji("ok")} Cleared ${result.count} tag audit revision${result.count === 1 ? "" : "s"}.`;
    }
}

export default TagAuditClearCommand;
