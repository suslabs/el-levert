import { escapeMarkdown } from "discord.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";

async function getDetail(revisionId, tagName) {
    let detail;

    try {
        detail = await getClient().tagManager.auditDetail(revisionId, tagName);
    } catch (err) {
        if (err.name !== "TagError") {
            throw err;
        }

        return `${getEmoji("warn")} ${err.message}.`;
    }

    const response = await RevisionAuditUtil.createDetailResponse(detail, {
        filePrefix: "tag-revision",
        label: detail.label ?? detail.revision.key.name ?? "unknown",
        perSubject: Util.nonemptyString(tagName)
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
        args: "[tag_name] [revision_id] [--options]",
        description: `View recent tag revisions or inspect a specific revision diff.

Calling without a tag name shows the full audit log across all tags. Providing a revision ID displays the full before/after diff for that revision.`,
        usage: `- [tag_name]: Target tag to view revisions for.
- [revision_id]: Specific revision ID to inspect diff.
- --user, --actor <user>: Filter revisions by author.
- --operation, --op <op>: Filter by operation (import, create, update, delete, revert).
- --from <date>, --to <date>: Filter by date or time range.
- --page <number>: Page number of results (default: 1).
- --limit <number>: Number of entries per page (1-20, default: 10).`,
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
                name: "firstArg",
                kind: "positional",
                index: 0
            },
            {
                name: "secondArg",
                kind: "positional",
                index: 1
            }
        ]
    };

    load() {
        return getConfig().enableAuditLog;
    }

    async handler(ctx) {
        const firstArg = ctx.arg("firstArg"),
            secondArg = ctx.arg("secondArg");

        if (!Util.empty(secondArg)) {
            const detailId = RevisionAuditUtil.parseRevisionId(secondArg);

            if (detailId === null) {
                return `${getEmoji("warn")} Invalid revision ID: \`${secondArg}\`.`;
            }

            return await getDetail(detailId, firstArg);
        }

        let tagName = null;

        if (!Util.empty(firstArg)) {
            const detailId = RevisionAuditUtil.parseRevisionId(firstArg);

            if (detailId !== null) {
                return await getDetail(detailId);
            }

            tagName = firstArg.toLowerCase();
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

        const isPerSubject = Util.nonemptyString(tagName);
        const scopeLabel = isPerSubject ? ` for **${escapeMarkdown(tagName)}**` : "",
            header = `${getEmoji("info")} Tag audit page **${page}**${scopeLabel}:`,
            embed = RevisionAuditUtil.createListEmbed(revisions, page, revision => revision.key.name ?? "unknown", {
                perSubject: isPerSubject
            });

        return {
            content: header,
            embeds: [embed]
        };
    }
}

export default TagAuditCommand;
