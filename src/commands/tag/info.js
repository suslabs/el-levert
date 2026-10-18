import { EmbedBuilder, escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

function bold(str, discord = true) {
    return discord ? `**${str}**` : str;
}

function italic(str, discord = true) {
    return discord ? `*${str}*` : str;
}

function code(str, discord = true) {
    return discord ? `\`${str}\`` : str;
}

function codeblock(str) {
    return `\`\`\`json\n${str}\`\`\``;
}

function formatInfo(tag, info, discord = true) {
    const timeInfo = tag.getTimeInfo(false, discord);

    const hopsStr =
        Array.isArray(info.hops) && !Util.empty(info.hops)
            ? info.hops.map(h => italic(h, discord)).join(" -> ")
            : "none";

    const lines = [
        `${bold("Hops", discord)}: ${hopsStr}`,
        `${bold("Is alias", discord)}: ${info.isAlias}`,
        `${bold("Name", discord)}: ${italic(info.name, discord)}`,
        `${bold("Alias name", discord)}: ${info.aliasName}`,
        `${bold("Body", discord)}: ${info.body}`,
        `${bold("Size", discord)}: ${Util.formatSize(info.size * Util.dataBytes.kilobyte, {
            unit: "kilobyte",
            short: true,
            digits: 2
        })}`,
        `${bold("Uses", discord)}: ${Util.formatNumber(info.uses)}`,
        `${bold("Is script", discord)}: ${info.isScript}`,
        `${bold("Is binary", discord)}: ${info.isBinary}`,
        `${bold("Is hidden", discord)}: ${info.isHidden}`,
        `${bold("Owner", discord)}: ${info.owner} (${code(info.ownerId, discord)})`,
        `${bold("Args", discord)}: ${info.args}`,
        `${bold("Registered", discord)}: ${timeInfo.registered}`,
        `${bold("Last edited", discord)}: ${timeInfo.lastEdited}`,
        `${bold("Registered timestamp", discord)}: ${info.registeredTimestamp}`,
        `${bold("Last edited timestamp", discord)}: ${info.lastEditedTimestamp}`,
        `${bold("Type", discord)}: ${info.type}`,
        info.isScript ? `${bold("Language", discord)}: ${info.language}` : null,
        `${bold("Version", discord)}: ${info.version}`,
        `${bold("Type int", discord)}: ${info.typeInt}`
    ];

    return lines.filter(Boolean).join("\n");
}

class TagInfoCommand {
    static info = {
        name: "info",
        aliases: ["data"],
        parent: "tag",
        subcommand: true,
        allowed: "mod",
        args: "<name> [default|json|raw]",
        description:
            "Displays stored database metadata, type flags, ownership, and byte size for a tag. Moderator-only diagnostic tool for inspecting tag properties.",
        usage: "- <name>: Target tag to inspect.\n- [default|json|raw]: Output mode (default: embed/text, json: formatted json, raw: stored db record).",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "infoType",
                kind: "positional",
                index: 1,
                lowercase: true
            }
        ]
    };

    static validModes = new Set(["default", "json", "raw"]);

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            mode = ctx.arg("infoType") ?? "default";

        if (!TagInfoCommand.validModes.has(mode)) {
            return `${getEmoji("warn")} Invalid info mode: \`${mode}\`.`;
        }

        {
            const err = this.parentCmd.checkCommand(t_name);

            if (err !== null) {
                return err;
            }
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        const header = `${getEmoji("info")} Tag info for **${escapeMarkdown(t_name)}**:`;

        if (mode === "default") {
            const info = await tag.getInfo(false),
                desc = formatInfo(tag, info, true);

            const embed = new EmbedBuilder().setDescription(desc);

            const embedLimits = ctx.handler != null ? ctx.handler.getLimits().embed : [DiscordUtil.embedCharLimit];

            if (DiscordUtil.overSizeLimits(embed, ...embedLimits)) {
                const plainText = formatInfo(tag, info, false);

                return {
                    content: header,
                    ...DiscordUtil.getFileAttach(plainText, "tag_info.txt")
                };
            }

            return {
                content: header,
                embeds: [embed]
            };
        }

        const raw = mode === "raw",
            info = await tag.getInfo(raw),
            infoJson = JSON.stringify(info, undefined, 4);

        if (infoJson.length + 10 > getClient().commandHandler.outCharLimit) {
            return {
                content: header,
                ...DiscordUtil.getFileAttach(infoJson, "info.json")
            };
        }

        return `${header}\n${codeblock(infoJson)}`;
    }
}

export default TagInfoCommand;
