import { escapeMarkdown } from "discord.js";

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
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: [true, true]
            },
            {
                name: "infoType",
                parser: "split",
                index: 1,
                lowercase: [true, true]
            }
        ]
    };

    async handler(ctx) {

        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name")}`;
        }

        let t_name = ctx.arg("tagName"),
            i_type = ctx.arg("infoType"),
            raw = i_type === "raw";

        if (this.matchesSubcmd(t_name)) {
            return `${getEmoji("invalid")} **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
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
