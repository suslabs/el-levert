import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import PermissionRevisionTargets from "../../managers/database/revision/PermissionRevisionTargets.js";

import Util from "../../util/Util.js";
import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";

function getLabel(revision) {
    switch (revision.target) {
        case PermissionRevisionTargets.group:
            return revision.key.name ?? "unknown";
        case PermissionRevisionTargets.user:
            return `${revision.key.user ?? "unknown"} in ${revision.key.group ?? "unknown"}`;
        default:
            return "unknown";
    }
}

async function getDetail(revisionId) {
    let detail;

    try {
        detail = await getClient().permManager.auditDetail(revisionId);
    } catch (err) {
        if (err.name !== "PermissionError") {
            throw err;
        }

        return `${getEmoji("warn")} ${err.message}.`;
    }

    const response = await RevisionAuditUtil.createDetailResponse(detail, {
        filePrefix: "permission-revision",
        label: detail.label ?? getLabel(detail.revision)
    });

    return {
        ...response,
        content: `${getEmoji("info")} ${response.content}`
    };
}

class PermAuditCommand {
    static info = {
        name: "audit",
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        args: "[group_name|user] [revision_id] [--options]",
        description:
            "View permission revisions or inspect a specific revision diff. Calling without a target shows the full audit log across all permission operations.",
        usage: `- [group_name|user]: Filter revisions by group name, user mention, or ID.
- [revision_id]: Specific revision ID to inspect diff.
- --user, --actor <user>: Filter revisions by author.
- --op, --operation <op>: Filter by operation.
- --from <date>, --to <date>: Filter by date range.
- --page <number>: Page number of results (default: 1).
- --limit <number>: Entries per page (1-20, default: 10).`,
        arguments: [
            {
                name: "user",
                kind: "option",
                aliases: ["actor"]
            },
            {
                name: "operation",
                kind: "option",
                aliases: ["op"],
                lowercase: true
            },
            {
                name: "target",
                kind: "option",
                lowercase: true
            },
            {
                name: "from",
                kind: "option"
            },
            {
                name: "to",
                kind: "option"
            },
            {
                name: "page",
                kind: "option",
                type: "integer"
            },
            {
                name: "limit",
                kind: "option",
                type: "integer"
            },
            {
                name: "subject",
                kind: "positional",
                index: 0
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
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("[subject] [revision_id] [--options]")}`;
        }

        const subject = ctx.arg("subject");

        if (!Util.empty(ctx.arg("scopeArgs"))) {
            const detailId = RevisionAuditUtil.parseRevisionId(ctx.arg("scopeArgs"));

            if (detailId === null) {
                return `${getEmoji("warn")} Invalid revision ID: \`${ctx.arg("scopeArgs")}\`.`;
            }

            return await getDetail(detailId);
        }

        const dates = RevisionAuditUtil.parseDateRange(ctx.arg("from"), ctx.arg("to"));

        if (dates.error) {
            return `${getEmoji("warn")} ${dates.error}`;
        }

        const limit = Util.clamp(ctx.arg("limit") ?? 10, 1, 20),
            page = Util.clamp(ctx.arg("page") ?? 1, 1),
            { from, to } = dates,
            revisions = await getClient().permManager.audit({
                subject,
                target: ctx.arg("target") ?? null,
                actor: ctx.arg("user") ?? null,
                operation: ctx.arg("operation") ?? null,
                from,
                to,
                limit,
                offset: (page - 1) * limit
            });

        if (Util.empty(revisions)) {
            return `${getEmoji("info")} Found **no** permission revisions.`;
        }

        const header = `${getEmoji("info")} Permission audit page **${page}**:`,
            embed = RevisionAuditUtil.createListEmbed(revisions, page, getLabel);

        return {
            content: header,
            embeds: [embed]
        };
    }
}

export default PermAuditCommand;
