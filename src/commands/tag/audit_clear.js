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
        args: "[tag_name] [revision_id] [end_revision_id] [--options]",
        description:
            "Clear tag audit history as the bot owner. Wipes revision entries matching the given tag, revision ID range, or date range, and resets the autoincrement sequence when performing a full wipe.",
        usage: "- [tag_name]: Filter revision wipe to this tag.\n- [revision_id]: Specific revision ID or start of range.\n- [end_revision_id]: End of revision ID range.\n- --from <date>: Clear revisions created on or after date.\n- --to <date>: Clear revisions created on or before date.",
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
