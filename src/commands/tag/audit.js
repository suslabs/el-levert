import { escapeMarkdown } from "discord.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

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
    static defaultLimit = 10;
    static maxLimit = 20;
    static dumpLimit = 1000;

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
- --limit <number>: Number of entries per page (1-20, default: 10).
- --all: Dump all matching revisions.`,
        arguments: [
            ...PaginationUtil.getPaginationArguments({
                defaultLimit: TagAuditCommand.defaultLimit,
                maxLimit: TagAuditCommand.maxLimit
            }),
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

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
                defaultLimit: TagAuditCommand.defaultLimit,
                maxLimit: TagAuditCommand.maxLimit
            }),
            fetchLimit = paginationOpts.all ? TagAuditCommand.dumpLimit : 100;

        const { from, to } = dates;

        const revisions = await getClient().tagManager.audit({
            name: tagName,
            actor: ctx.arg("user") ?? null,
            operation: ctx.arg("operation") ?? null,
            from,
            to,
            limit: fetchLimit,
            offset: 0
        });

        if (Util.empty(revisions)) {
            return `${getEmoji("info")} Found **no** tag revisions.`;
        }

        const isPerSubject = Util.nonemptyString(tagName),
            scopeLabel = isPerSubject ? ` for **${escapeMarkdown(tagName)}**` : "";

        return await PaginationUtil.paginate(ctx, {
            items: revisions,
            defaultLimit: TagAuditCommand.defaultLimit,
            maxLimit: TagAuditCommand.maxLimit,

            render: async (items, { page }) => {
                const header = `${getEmoji("info")} Tag audit page **${page}**${scopeLabel}:`,
                    embed = await RevisionAuditUtil.createListEmbed(
                        items,
                        page,
                        revision => revision.key.name ?? "unknown",
                        {
                            perSubject: isPerSubject
                        }
                    );

                return {
                    content: header,
                    embeds: [embed]
                };
            },

            dumpHeader: `${getEmoji("info")} Tag audit${scopeLabel}:`,
            formatDump: (items, discord = true) =>
                RevisionAuditUtil.formatRevisionList(items, revision => revision.key.name ?? "unknown", {
                    perSubject: isPerSubject,
                    discord
                }),
            filename: "tag_audit.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagAuditCommand;
