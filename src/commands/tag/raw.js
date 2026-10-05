import { escapeMarkdown, bold } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRawCommand {
    static info = {
        name: "raw",
        aliases: ["code"],
        parent: "tag",
        subcommand: true,
        args: "<name>",
        description:
            "Displays the unrendered source body or attachment of a tag without executing it. If the tag is an alias, resolves and displays the full alias chain followed by the base tag's source.",
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

        if (tag.isAlias) {
            let baseTag;

            try {
                baseTag = await getClient().tagManager.fetchAlias(tag, false);
            } catch (err) {
                if (err.name !== "TagError") {
                    throw err;
                }

                return `${getEmoji("warn")} ${err.message}.`;
            }

            const hops = baseTag.hops ?? [tag.name, tag.aliasName];

            let chainStr;

            if (hops.length > 2) {
                chainStr = `${bold(escapeMarkdown(Util.first(hops)))} is an alias of ${hops
                    .slice(1)
                    .map(h => bold(escapeMarkdown(h)))
                    .join(" -> ")}:`;
            } else {
                chainStr = `${bold(escapeMarkdown(tag.name))} is an alias of ${bold(escapeMarkdown(tag.aliasName))}:`;
            }

            if (!Util.empty(tag.args)) {
                chainStr += ` (with args: \`${escapeMarkdown(tag.args)}\`)`;
            }

            const baseRaw = baseTag.getRaw(true),
                out = {
                    ...baseRaw,
                    content: baseRaw.content ? `${chainStr}\n${baseRaw.content}` : chainStr
                };

            out.content = `${getEmoji("info")} ${out.content}`;
            return out;
        }

        const out = tag.getRaw(true);
        out.content = out.content ? `${getEmoji("info")} ${out.content}` : out.content;

        return out;
    }
}

export default TagRawCommand;
