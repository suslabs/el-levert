import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

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
        args: "<name> [raw]",
        description:
            "Displays stored database metadata, type flags, ownership, and byte size for a tag. Moderator-only diagnostic tool for inspecting tag properties.",
        usage: "- <name>: Target tag to inspect.\n- [raw]: Optional flag to dump the unformatted JSON object.",
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

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            i_type = ctx.arg("infoType"),
            raw = i_type === "raw";

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

        const header = `${getEmoji("info")} Tag info for **${escapeMarkdown(t_name)}**:`,
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
