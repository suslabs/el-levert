import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

class TagEditCommand {
    static info = {
        name: "edit",
        parent: "tag",
        subcommand: true,
        args: "<name> [new_body]",
        description:
            "Replaces a tag's body with new text, codeblock, or file attachment. Only the owner or moderators can edit a tag. The bot owner can provide local file paths.",
        usage: "- <name>: The name of the tag to edit.\n- [new_body]: The updated content, or supply a file attachment.",
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
                name: "tagArgs",
                kind: "positional",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("tagArgs");

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

        {
            const err = await this.parentCmd.checkOwner(tag, ctx, this.name);

            if (err !== null) {
                return err;
            }
        }

        let parsed = await this.parentCmd.parseBase(t_args, ctx, {
                allowFilePath: this.parentCmd.canUseFilePath(ctx)
            }),
            { body, meta, attachment, fromReply, localFile } = parsed;

        if (parsed.err !== null) {
            return parsed.err;
        }

        {
            let err;
            [body, err] = getClient().tagManager.checkBody(body, false, meta.type === "binary");

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let newTag;

        try {
            newTag = await getClient().tagManager.edit(
                tag,
                body,
                meta,
                {
                    validateNew: false
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

        const suffix = fromReply ? " from replied message" : "";
        let out = `${getEmoji("ok")} Edited ${this.parentCmd.formatTagType(newTag)} **${escapeMarkdown(t_name)}**${suffix}.`;

        if (attachment) {
            out += `\n${this.parentCmd.attachmentWarning}`;
        } else if (localFile) {
            out += `\n${this.parentCmd.localFileWarning}`;
        }

        return out;
    }
}

export default TagEditCommand;
