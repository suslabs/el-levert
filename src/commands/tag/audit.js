import * as chrono from "chrono-node";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";

function parseTime(value) {
    if (Util.empty(value)) {
        return null;
    }

    return chrono.parseDate(value)?.getTime() ?? null;
}

class TagAuditCommand {
    static info = {
        name: "audit",
        parent: "tag",
        subcommand: true,
        allowed: "mod",
        description: "View recent tag revisions or inspect the complete change to one revision.",
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "revisionId",
                kind: "positional",
                index: 1,
                type: "integer"
            },
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
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("[tag_name] [revision_id] [--options]")}`;
        }

        const revisionId = ctx.arg("revisionId"),
            tagName = ctx.arg("tagName");

        if (revisionId != null) {
            return await this._detail(revisionId);
        }

        const limit = Util.clamp(ctx.arg("limit") ?? 10, 1, 20),
            page = Util.clamp(ctx.arg("page") ?? 1, 1),
            from = parseTime(ctx.arg("from")),
            to = parseTime(ctx.arg("to"));

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

    async _detail(revisionId) {
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
}

export default TagAuditCommand;
