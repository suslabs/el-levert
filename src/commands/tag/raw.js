import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRawCommand {
    static info = {
        name: "raw",
        aliases: ["code"],
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {

        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name")}`;
        }

        let t_name = ctx.arg("tagName");

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

        const out = tag.getRaw(true);
        out.content = out.content ? `${getEmoji("info")} ${out.content}` : out.content;

        return out;
    }
}

export default TagRawCommand;
