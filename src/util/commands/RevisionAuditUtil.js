import { EmbedBuilder, escapeMarkdown } from "discord.js";

import Util from "../Util.js";
import DiscordUtil from "../DiscordUtil.js";
import ObjectUtil from "../ObjectUtil.js";
import DateUtil from "./DateUtil.js";

const RevisionAuditUtil = Object.freeze({
    formatDate: time => {
        return new Date(time).toUTCString();
    },

    createDetailResponse: (detail, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const filePrefix = options.filePrefix ?? "revision",
            titlePrefix = options.titlePrefix ?? "Revision",
            label = escapeMarkdown(options.label ?? "");

        const { revision, diff } = detail,
            fields = Object.entries(diff).map(([field, value]) => ({
                name: field,
                value: [
                    `Before: ${RevisionAuditUtil._formatValue(value.before, true)}`,
                    `After: ${RevisionAuditUtil._formatValue(value.after, true)}`
                ].join("\n")
            })),
            embed = new EmbedBuilder()
                .setTitle(`${titlePrefix} #${revision.id} | ${label}`)
                .setDescription(
                    [
                        `Operation: \`${revision.operation}\``,
                        `Actor: \`${revision.actor}\``,
                        `Created: ${RevisionAuditUtil.formatDate(revision.created)}`,
                        `Changed: ${revision.changed.join(", ")}`
                    ].join("\n")
                );

        if (!Util.empty(fields)) {
            embed.addFields(fields);
        } else {
            embed.setDescription(`${embed.data.description}\n\nNo tracked fields changed.`);
        }

        if (DiscordUtil.getEmbedSize(embed) > 6000 || fields.some(field => field.value.length > 1024)) {
            return {
                content: `${titlePrefix} **#${revision.id}** for **${label}**:`,
                ...DiscordUtil.getFileAttach(
                    [
                        `${titlePrefix} #${revision.id} for ${label}`,
                        `Operation: ${revision.operation}`,
                        `Actor: ${revision.actor}`,
                        `Created: ${RevisionAuditUtil.formatDate(revision.created)}`,
                        `Changed: ${revision.changed.join(", ")}`,
                        "",
                        RevisionAuditUtil._formatDiff(diff, true)
                    ].join("\n"),
                    `${filePrefix}-${revision.id}.txt`
                )
            };
        }

        return {
            content: `${titlePrefix} **#${revision.id}** for **${label}**:`,
            embeds: [embed]
        };
    },

    createListEmbed: (revisions, title, page, getLabel) => {
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(RevisionAuditUtil._formatRevisionList(revisions, getLabel))
            .setFooter({ text: `Page ${page} | ${revisions.length} revision${Util.single(revisions) ? "" : "s"}` });
    },

    parseDateRange: (fromText, toText) => {
        return DateUtil.parseRange(fromText, toText);
    },

    parseRevisionId: value => {
        if (Util.empty(value)) {
            return null;
        }

        const id = Util.parseInt(String(value));
        return Number.isInteger(id) && id > 0 ? id : null;
    },

    clearAudit: async (ctx, manager, isOwner, subjectText) => {
        if (!isOwner) {
            return {
                error: "Only the bot owner can clear audit history."
            };
        }

        const scope = RevisionAuditUtil._parseClearScope(ctx, subjectText);

        if (scope.error) {
            return scope;
        }

        return {
            count: await manager.clearAudit(scope)
        };
    },

    _formatValue: (value, full = false) => {
        if (value === null) {
            return "<missing>";
        } else if (typeof value === "undefined") {
            return "<unset>";
        } else if (typeof value === "string") {
            return full
                ? value
                : Util.trimString(value, 300, 5, {
                      showDiff: true
                  });
        }

        return JSON.stringify(value);
    },

    _formatDiff: (diff, full = false) => {
        const entries = Object.entries(diff);

        if (Util.empty(entries)) {
            return "No tracked fields changed.";
        }

        return entries
            .map(
                ([field, value]) =>
                    `${field}:\n- ${RevisionAuditUtil._formatValue(value.before, full)}\n+ ${RevisionAuditUtil._formatValue(value.after, full)}`
            )
            .join("\n\n");
    },

    _formatRevisionList: (revisions, getLabel) => {
        return revisions
            .map(revision => {
                const label = escapeMarkdown(getLabel(revision));

                return `#${revision.id} **${revision.operation}** ${label} - \`${revision.actor}\` - ${RevisionAuditUtil.formatDate(revision.created)}\nChanged: ${revision.changed.join(", ")}`;
            })
            .join("\n\n");
    },

    _parseClearScope: (ctx, subjectText) => {
        const scopeArgs = String(ctx.arg("scopeArgs") ?? "").trim(),
            tokens = Util.empty(scopeArgs) ? [] : scopeArgs.split(/\s+/),
            dates = RevisionAuditUtil.parseDateRange(ctx.arg("from"), ctx.arg("to"));

        let subject = null,
            fromId = null,
            toId = null;

        if (!Util.empty(subjectText)) {
            subject = subjectText;
        }

        if (subject === null && !Util.empty(tokens) && RevisionAuditUtil.parseRevisionId(Util.first(tokens)) === null) {
            subject = tokens.shift();
        }

        if (!Util.empty(tokens)) {
            fromId = RevisionAuditUtil.parseRevisionId(tokens.shift());
            toId = fromId;

            if (fromId === null) {
                return {
                    error: `Invalid revision ID: \`${scopeArgs}\`.`
                };
            }

            if (!Util.empty(tokens)) {
                toId = RevisionAuditUtil.parseRevisionId(tokens.shift());

                if (toId === null) {
                    return {
                        error: `Invalid revision range: \`${scopeArgs}\`.`
                    };
                }
            }

            if (!Util.empty(tokens)) {
                return {
                    error: `Invalid revision range: \`${scopeArgs}\`.`
                };
            }
        }

        if (fromId !== null && toId !== null && fromId > toId) {
            [fromId, toId] = [toId, fromId];
        }

        if ((fromId !== null || toId !== null) && (dates.from !== null || dates.to !== null)) {
            return {
                error: "Revision IDs and date filters can't be combined."
            };
        }

        return {
            subject,
            fromId,
            toId,
            from: dates.from,
            to: dates.to
        };
    }
});

export default RevisionAuditUtil;
