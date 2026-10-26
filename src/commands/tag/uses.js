import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagUsesCommand {
    static info = {
        name: "uses",
        aliases: [],
        parent: "tag",
        subcommand: true,
        args: "<name>",
        description: "Displays how many times a tag has been used.",
        usage: "- <name>: The name of the tag to view.",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        let t_name = ctx.arg("tagName");

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

        const uses = await tag.getUsage(),
            useNum = Util.formatNumber(uses),
            s = uses === 1 ? "" : "s";

        return `${getEmoji("info")} Tag **${escapeMarkdown(tag.name)}** has been used **${useNum}** time${s}.`;
    }
}

export default TagUsesCommand;
