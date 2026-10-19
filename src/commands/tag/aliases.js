import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

function formatAlias(tag) {
    let format = `**${escapeMarkdown(tag.name)}**`;

    if (!Util.empty(tag.args)) {
        format += ` (args: \`${Util.trimString(tag.args, 100)}\`)`;
    }

    if (tag.isHidden) {
        format += " *(hidden)*";
    }

    return format;
}

class TagAliasesCommand {
    static maxInlineLimit = 20;

    static info = {
        name: "aliases",
        parent: "tag",
        subcommand: true,
        args: "<name>",
        description: "Lists all aliases pointing to a tag.",
        usage: "- <name>: The name of the tag to view aliases for.",
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

        const aliases = await getClient().tagManager.fetchAliases(t_name);

        if (aliases === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        if (Util.empty(aliases)) {
            return `${getEmoji("info")} Tag **${escapeMarkdown(t_name)}** has **no** aliases.`;
        }

        const s = Util.single(aliases) ? "" : "es",
            count = Util.formatNumber(aliases.length);

        const header = `${getEmoji("info")} Tag **${escapeMarkdown(t_name)}** has **${count}** alias${s}:`;

        if (aliases.length > TagAliasesCommand.maxInlineLimit) {
            const dump = aliases.map(alias => alias.format()).join("\n");

            return {
                content: header,
                ...DiscordUtil.getFileAttach(dump, "aliases.txt")
            };
        }

        return `${header} ${aliases.map(formatAlias).join(", ")}`;
    }
}

export default TagAliasesCommand;
