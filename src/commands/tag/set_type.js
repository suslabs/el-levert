import { escapeMarkdown } from "discord.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

class TagSetTypeCommand {
    static info = {
        name: "set_type",
        args: "<name> <flag> [value]",
        description:
            "Changes a script tag's execution type, runtime environment, or script version flag (moderators only).",
        usage: "- <name>: The name of the tag to modify.\n- <flag>: The type property or script setting to change.\n- [value]: New setting value.",
        parser: {
            requireArgs: true
        },
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
