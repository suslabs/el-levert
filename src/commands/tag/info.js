import { EmbedBuilder, escapeMarkdown } from "discord.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

function codeblock(str) {
    return `\`\`\`json\n${str}\`\`\``;
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
            const owner = await getClient().formatUser(tag.owner, true),
                timeInfo = tag.getTimeInfo(false),
                size = `${Util.formatNumber(tag.getSize(), 2)} KB`;

            const activeFlags = TagTypes.flags.names.filter(flag => tag.type.hasFlag(flag));

            const lines = [
                `**Owner**: ${owner}`,
                `**Type**: \`${tag.getScriptType()}\``,
                `**Version**: \`${tag.getVersion()}\``,
                tag.isScript ? `**Language**: \`${tag.getScriptLanguage()}\`` : null,
                `**Type int**: \`${tag.type.toNumber()}\``,
                `**Size**: ${size}`,
                `**Registered**: ${timeInfo.registered}`,
                `**Last edited**: ${timeInfo.lastEdited}`
            ];

            if (tag.isAlias) {
                lines.push(`**Alias to**: **${escapeMarkdown(tag.aliasName)}**`);

                if (!Util.empty(tag.args)) {
                    lines.push(`**Args**: ${tag.args}`);
                }

                if (tag.hops.length > 2) {
                    lines.push(`**Hops**: ${tag.hops.join(" -> ")}`);
                }
            }

            if (!Util.empty(activeFlags)) {
                lines.push(`**Flags**: \`${activeFlags.join(", ")}\``);
            }

            const embed = new EmbedBuilder().setDescription(lines.filter(Boolean).join("\n"));

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
