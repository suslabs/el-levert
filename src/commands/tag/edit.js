import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagEditCommand {
    static info = {
        name: "edit",
        description: "Edit a tag's body and properties.",
        parent: "tag",
        subcommand: true,
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
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name new_body")}`;
        }

        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("tagArgs");

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

        {
            const err = await this.parentCmd.checkOwner(tag, ctx, this.name);

            if (err !== null) {
                return err;
            }
        }

        let parsed = await this.parentCmd.parseBase(t_args, ctx.msg, {
                allowFilePath: getClient().permManager.allowed(ctx.perm, "admin")
            }),
            { body, meta, attachment } = parsed;

        if (parsed.err !== null) {
            return parsed.err;
        }

        {
            let err;
            [body, err] = getClient().tagManager.checkBody(body, false, meta?.type === "binary");

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

        let out = `${getEmoji("ok")} Edited ${this.parentCmd.formatTagType(newTag)} **${escapeMarkdown(t_name)}**.`;

        if (attachment) {
            out += `\n${this.parentCmd.attachmentWarning}`;
        }

        return out;
    }
}

export default TagEditCommand;
