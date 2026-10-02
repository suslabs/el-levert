import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";

async function getDetail(revisionId) {
    let detail;

    try {
        detail = await getClient().tagManager.auditDetail(revisionId);
    } catch (err) {
        if (err.name !== "TagError") {
            throw err;
        }

        return `${getEmoji("warn")} ${err.message}.`;
    }

    const response = RevisionAuditUtil.createDetailResponse(detail, {
        filePrefix: "tag-revision",
        label: detail.label ?? detail.revision.key.name ?? "unknown"
    });

    return {
        ...response,
        content: `${getEmoji("info")} ${response.content}`
    };
}

class TagAuditCommand {
    static info = {
        name: "audit",
        parent: "tag",
        subcommand: true,
        allowed: "mod",
        description: "View tag revisions or inspect one revision.",
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
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
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
            return `${getEmoji("info")} ${this.getArgsHelp("[tag_name] [revision_id] [--options]")}`;
        }

        const tagName = ctx.arg("tagName");

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
            { from, to } = dates;

        const revisions = await getClient().tagManager.audit({
            name: tagName,
            actor: ctx.arg("user") ?? null,
            operation: ctx.arg("operation") ?? null,
            from,
            to,
            limit,
            offset: (page - 1) * limit
        });

        if (Util.empty(revisions)) {
            return `${getEmoji("info")} Found **no** tag revisions.`;
        }

        const header = `${getEmoji("info")} Tag audit page **${page}**:`,
            embed = RevisionAuditUtil.createListEmbed(
                revisions,
                "Tag audit",
                page,
                revision => revision.key.name ?? "unknown"
            );

        return {
            content: header,
            embeds: [embed]
        };
    }
}

export default TagAuditCommand;
