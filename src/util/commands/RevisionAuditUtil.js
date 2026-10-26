import { EmbedBuilder, escapeMarkdown, time } from "discord.js";

import Tag from "../../structures/tag/Tag.js";

import { getClient } from "../../LevertClient.js";

import Util from "../Util.js";
import DiscordUtil from "../DiscordUtil.js";
import ObjectUtil from "../ObjectUtil.js";
import DateUtil from "./DateUtil.js";

const RevisionAuditUtil = Object.freeze({
    formatDate: (date, discord = false) => {
        if (discord) {
            return time(new Date(date));
        }

        return new Date(date).toUTCString();
    },

    formatUser: async (user, discord = false, options = {}) => {
        return await getClient().formatUser(user, discord, options);
    },

    createDetailResponse: async (detail, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const filePrefix = options.filePrefix ?? "revision",
            titlePrefix = options.titlePrefix ?? "Revision",
            label = escapeMarkdown(options.label ?? ""),
            useSubjectIndex = options.perSubject ?? false;

        const { revision, diff } = detail,
            revNum = useSubjectIndex ? (revision.subjectIndex ?? revision.id) : revision.id;

        const formattedActor = await RevisionAuditUtil.formatUser(revision.actor, true),
            rawActor = await RevisionAuditUtil.formatUser(revision.actor, false);

        let version = options.version ?? null;

        if (version === null) {
            const typeBuf = detail.after?.type ?? detail.before?.type ?? null;

            if (typeBuf !== null) {
                try {
                    version = new Tag({ type: typeBuf }).getVersion();
                } catch (err) {}
            }
        }

        const fields = await Promise.all(
            Object.entries(diff).map(async ([field, value]) => {
                const before = await RevisionAuditUtil._formatDiffValue(field, value.before, true, true),
                    after = await RevisionAuditUtil._formatDiffValue(field, value.after, true, true);

                return {
                    name: field,
                    value: `Before: ${before}\nAfter: ${after}`
                };
            })
        );

        const embed = new EmbedBuilder().setDescription(
            [
                `Operation: \`${revision.operation}\``,
                `Actor: ${formattedActor}`,
                version !== null ? `Version: \`${version}\`` : null,
                useSubjectIndex && revision.id !== revNum ? `Global ID: \`#${revision.id}\`` : null,
                `Created: ${RevisionAuditUtil.formatDate(revision.created, true)}`,
                `Changed: ${revision.changed.join(", ")}`
            ]
                .filter(Boolean)
                .join("\n")
        );

        if (!Util.empty(fields)) {
            embed.addFields(fields);
        } else {
            embed.setDescription(`${embed.data.description}\n\nNo tracked fields changed.`);
        }

        if (DiscordUtil.embedComponentsOverSizeLimit(embed)) {
            const diffText = await RevisionAuditUtil._formatDiff(diff, true, false);

            return {
                content: `${titlePrefix} **#${revNum}** for **${label}**:`,
                ...DiscordUtil.getFileAttach(
                    [
                        `${titlePrefix} #${revNum} for ${label}`,
                        `Operation: ${revision.operation}`,
                        `Actor: ${rawActor}`,
                        version !== null ? `Version: ${version}` : null,
                        useSubjectIndex && revision.id !== revNum ? `Global ID: #${revision.id}` : null,
                        `Created: ${RevisionAuditUtil.formatDate(revision.created)}`,
                        `Changed: ${revision.changed.join(", ")}`,
                        "",
                        diffText
                    ]
                        .filter(Boolean)
                        .join("\n"),
                    `${filePrefix}-${revNum}.txt`
                )
            };
        }

        return {
            content: `${titlePrefix} **#${revNum}** for **${label}**:`,
            embeds: [embed]
        };
    },

    formatRevisionList: async (revisions, getLabel, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const useSubjectIndex = options.perSubject ?? false,
            isDiscord = options.discord ?? true;

        const formattedRevisions = await Promise.all(
            revisions.map(async revision => {
                const rawLabel = getLabel(revision),
                    label = isDiscord ? escapeMarkdown(rawLabel) : rawLabel;

                const revNum = useSubjectIndex ? (revision.subjectIndex ?? revision.id) : revision.id;

                const actor = await RevisionAuditUtil.formatUser(revision.actor, isDiscord),
                    date = RevisionAuditUtil.formatDate(revision.created, isDiscord);

                const op = isDiscord ? `**${revision.operation}**` : revision.operation;

                return `#${revNum} ${op} ${label} - ${actor} - ${date}\nChanged: ${revision.changed.join(", ")}`;
            })
        );

        return formattedRevisions.join("\n\n");
    },

    createListEmbed: async (revisions, page, getLabel, options) => {
        const description = await RevisionAuditUtil.formatRevisionList(revisions, getLabel, {
            ...options,
            discord: true
        });

        return new EmbedBuilder()
            .setDescription(description)
            .setFooter({ text: `Page ${page} | ${revisions.length} revision${Util.single(revisions) ? "" : "s"}` });
    },

    parseDateRange: (fromText, toText) => {
        return DateUtil.parseRange(fromText, toText);
    },

    parseRevisionId: value => {
        if (typeof value === "number") {
            return Number.isInteger(value) && value > 0 ? value : null;
        }

        value = value?.trim?.();

        if (Util.empty(value)) {
            return null;
        }

        const id = Util.parseInt(value);
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

    _formatDiffValue: async (field, value, full = false, discord = false) => {
        if (value === null) {
            return "<missing>";
        } else if (typeof value === "undefined") {
            return "<unset>";
        }

        switch (field) {
            case "type":
                return Tag.formatType(value);
            case "owner":
            case "user":
                return await RevisionAuditUtil.formatUser(value, discord);
            case "bin":
                return `[binary data: ${Util.getByteLength(value)} bytes]`;
            default:
                if (typeof value === "string") {
                    return full
                        ? value
                        : Util.trimString(value, 300, 5, {
                              showDiff: true
                          });
                }

                return JSON.stringify(value);
        }
    },

    _formatDiff: async (diff, full = false, discord = false) => {
        const entries = Object.entries(diff);

        if (Util.empty(entries)) {
            return "No tracked fields changed.";
        }

        const lines = await Promise.all(
            entries.map(async ([field, value]) => {
                const before = await RevisionAuditUtil._formatDiffValue(field, value.before, full, discord),
                    after = await RevisionAuditUtil._formatDiffValue(field, value.after, full, discord);

                return `${field}:\n- ${before}\n+ ${after}`;
            })
        );

        return lines.join("\n\n");
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
