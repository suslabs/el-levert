import { escapeMarkdown } from "discord.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

class TagSetTypeCommand {
    static info = {
        name: "set_type",
        description: "Change a tag's type or script settings.",
        parent: "tag",
        subcommand: true,
        allowed: "mod",
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "tagArgs",
                kind: "positional",
                index: 1
            },
            {
                name: "flag",
                from: "tagArgs",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "value",
                from: "tagArgs",
                kind: "positional",
                index: 1,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        if (ctx.argsText.length < 2) {
            return `${getEmoji("info")} ${this.getArgsHelp("name flag [value]")}`;
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

        let flag = ctx.arg("flag"),
            value = ctx.arg("value");

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        const meta = tag.getMeta();

        switch (flag) {
            case "version":
                meta.version = value;
                break;
            case "script":
                meta.type = TagTypes.defaults.scriptType;
                meta.language = value || meta.language;
                break;
            default:
                meta.type = flag;
                meta.language = value || meta.language;
        }

        tag.setMeta(meta);

        try {
            await getClient().tagManager.updateProps(
                t_name,
                tag,
                {
                    validateNew: false,
                    checkExisting: false
                },
                {
                    actor: ctx.msg.author.id
                }
            );
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Updated tag **${escapeMarkdown(t_name)}**.`;
    }
}

export default TagSetTypeCommand;
