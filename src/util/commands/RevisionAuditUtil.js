import { EmbedBuilder, escapeMarkdown } from "discord.js";

import Util from "../Util.js";
import DiscordUtil from "../DiscordUtil.js";
import ObjectUtil from "../ObjectUtil.js";

function formatDate(time) {
    return new Date(time).toUTCString();
}

function formatActor(actor) {
    return Util.empty(actor) ? "system" : actor;
}

function formatChanged(revision) {
    return Util.empty(revision.changed) ? "none" : revision.changed.join(", ");
}

function formatValue(value, full = false) {
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
}

function formatDiff(diff, full = false) {
    const entries = Object.entries(diff);

    if (Util.empty(entries)) {
        return "No tracked fields changed.";
    }

    return entries
        .map(([field, value]) => `${field}:\n- ${formatValue(value.before, full)}\n+ ${formatValue(value.after, full)}`)
        .join("\n\n");
}

function formatRevisionList(revisions, getLabel) {
    return revisions
        .map(revision => {
            const label = escapeMarkdown(getLabel(revision)),
                actor = formatActor(revision.actor);

            return `#${revision.id} **${revision.operation}** ${label} - \`${actor}\` - ${formatDate(revision.created)}\nChanged: ${formatChanged(revision)}`;
        })
        .join("\n\n");
}

function createListEmbed(revisions, title, page, getLabel) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(formatRevisionList(revisions, getLabel))
        .setFooter({ text: `Page ${page} | ${revisions.length} revision${Util.single(revisions) ? "" : "s"}` });
}

function createDetailResponse(detail, options) {
    options = {
        filePrefix: "revision",
        titlePrefix: "Revision",
        ...ObjectUtil.guaranteeObject(options)
    };

    const { revision, diff } = detail,
        label = escapeMarkdown(options.label),
        fields = Object.entries(diff).map(([field, value]) => ({
            name: field,
            value: [`Before: ${formatValue(value.before, true)}`, `After: ${formatValue(value.after, true)}`].join("\n")
        })),
        embed = new EmbedBuilder()
            .setTitle(`${options.titlePrefix} #${revision.id} | ${label}`)
            .setDescription(
                [
                    `Operation: \`${revision.operation}\``,
                    `Actor: \`${formatActor(revision.actor)}\``,
                    `Created: ${formatDate(revision.created)}`,
                    `Changed: ${formatChanged(revision)}`
                ].join("\n")
            );

    if (!Util.empty(fields)) {
        embed.addFields(fields);
    } else {
        embed.setDescription(`${embed.data.description}\n\nNo tracked fields changed.`);
    }

    if (DiscordUtil.getEmbedSize(embed) > 6000 || fields.some(field => field.value.length > 1024)) {
        return {
            content: `${options.titlePrefix} **#${revision.id}** for **${label}**:`,
            ...DiscordUtil.getFileAttach(
                [
                    `${options.titlePrefix} #${revision.id} for ${label}`,
                    `Operation: ${revision.operation}`,
                    `Actor: ${formatActor(revision.actor)}`,
                    `Created: ${formatDate(revision.created)}`,
                    `Changed: ${formatChanged(revision)}`,
                    "",
                    formatDiff(diff, true)
                ].join("\n"),
                `${options.filePrefix}-${revision.id}.txt`
            )
        };
    }

    return {
        content: `${options.titlePrefix} **#${revision.id}** for **${label}**:`,
        embeds: [embed]
    };
}

const RevisionAuditUtil = Object.freeze({
    formatActor,
    formatChanged,
    formatDate,
    createDetailResponse,
    createListEmbed
});

export default RevisionAuditUtil;
