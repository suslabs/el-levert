import { escapeMarkdown } from "discord.js";

import PermissionRevisionTargets from "../../managers/database/revision/PermissionRevisionTargets.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import RevisionAuditUtil from "../../util/commands/RevisionAuditUtil.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";

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
    static defaultLimit = 10;
    static maxLimit = 20;
    static dumpLimit = 1000;

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
- --limit <number>: Entries per page (1-20, default: 10).
- --all: Dump all matching revisions.`,
        arguments: [
            ...PaginationUtil.getPaginationArguments({
                defaultLimit: PermAuditCommand.defaultLimit,
                maxLimit: PermAuditCommand.maxLimit
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

        let subject = ctx.arg("subject");

        if (!Util.empty(ctx.arg("scopeArgs"))) {
            const detailId = RevisionAuditUtil.parseRevisionId(ctx.arg("scopeArgs"));

            if (detailId === null) {
                return `${getEmoji("warn")} Invalid revision ID: \`${ctx.arg("scopeArgs")}\`.`;
            }

            return await getDetail(detailId);
        }

        if (Util.nonemptyString(subject) && subject.includes("/")) {
            const parts = subject.split("/");

            if (parts.length === 2 && Util.nonemptyString(parts[0]) && Util.nonemptyString(parts[1])) {
                const find = Util.first(await getClient().findUsers(parts[0]));

                if (typeof find !== "undefined") {
                    subject = `${find.id}/${parts[1]}`;
                }
            }
        }

        const dates = RevisionAuditUtil.parseDateRange(ctx.arg("from"), ctx.arg("to"));

        if (dates.error) {
            return `${getEmoji("warn")} ${dates.error}`;
        }

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
                defaultLimit: PermAuditCommand.defaultLimit,
                maxLimit: PermAuditCommand.maxLimit
            }),
            fetchLimit = paginationOpts.all ? PermAuditCommand.dumpLimit : 100;

        const { from, to } = dates;

        const revisions = await getClient().permManager.audit({
            subject,
            target: ctx.arg("target") ?? null,
            actor: ctx.arg("user") ?? null,
            operation: ctx.arg("operation") ?? null,
            from,
            to,
            limit: fetchLimit,
            offset: 0
        });

        if (Util.empty(revisions)) {
            return `${getEmoji("info")} Found **no** permission revisions.`;
        }

        const isPerSubject = Util.nonemptyString(subject),
            scopeLabel = isPerSubject ? ` for **${escapeMarkdown(subject)}**` : "";

        return await PaginationUtil.paginate(ctx, {
            items: revisions,
            defaultLimit: PermAuditCommand.defaultLimit,
            maxLimit: PermAuditCommand.maxLimit,

            render: async (items, { page }) => {
                const header = `${getEmoji("info")} Permission audit page **${page}**${scopeLabel}:`,
                    embed = await RevisionAuditUtil.createListEmbed(items, page, getLabel, {
                        perSubject: isPerSubject
                    });

                return {
                    content: header,
                    embeds: [embed]
                };
            },

            dumpHeader: `${getEmoji("info")} Permission audit${scopeLabel}:`,
            formatDump: (items, discord = true) =>
                RevisionAuditUtil.formatRevisionList(items, getLabel, {
                    perSubject: isPerSubject,
                    discord
                }),
            filename: "permission_audit.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default PermAuditCommand;
