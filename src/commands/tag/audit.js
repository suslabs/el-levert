import chrono from "chrono-node";
import { escapeMarkdown, codeBlock } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

function formatDate(time) {
    return new Date(time).toUTCString();
}

function formatActor(actor) {
    return Util.empty(actor) ? "system" : actor;
}

function formatChanged(revision) {
    return Util.empty(revision.changed) ? "none" : revision.changed.join(", ");
}

function formatRevisionLine(revision) {
    const tagName = escapeMarkdown(revision.key.name ?? "unknown"),
        actor = formatActor(revision.actor);

    return `#${revision.id} ${revision.operation} **${tagName}** by \`${actor}\` at ${formatDate(revision.created)} - ${formatChanged(revision)}`;
}

function formatValue(value) {
    if (value === null) {
        return "<missing>";
    } else if (typeof value === "undefined") {
        return "<unset>";
    } else if (typeof value === "string") {
        return Util.trimString(value, 300, 5, {
            showDiff: true
        });
    }

    return JSON.stringify(value);
}

function formatDiff(diff) {
    const entries = Object.entries(diff);

    if (Util.empty(entries)) {
        return "No tracked fields changed.";
    }

    return entries
        .map(([field, value]) => `${field}:\n- ${formatValue(value.before)}\n+ ${formatValue(value.after)}`)
        .join("\n\n");
}

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
            lines = revisions.map(formatRevisionLine);

        return [header].concat(lines).join("\n");
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

        const { revision, diff } = detail,
            tagName = escapeMarkdown(revision.key.name ?? "unknown"),
            content = [
                `${getEmoji("info")} Revision **#${revision.id}** for **${tagName}**`,
                `Operation: \`${revision.operation}\``,
                `Actor: \`${formatActor(revision.actor)}\``,
                `Created: ${formatDate(revision.created)}`,
                `Changed: ${formatChanged(revision)}`,
                "",
                formatDiff(diff)
            ].join("\n");

        if (content.length > 1800) {
            return {
                content: `${getEmoji("info")} Revision **#${revision.id}** for **${tagName}**:`,
                ...DiscordUtil.getFileAttach(content, `tag-revision-${revision.id}.txt`)
            };
        }

        return codeBlock(content);
    }
}

export default TagAuditCommand;
