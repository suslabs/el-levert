import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagAddCommand {
    static info = {
        name: "add",
        description: "Create a tag.",
        aliases: ["create"],
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
            return `${getEmoji("info")} ${this.getArgsHelp("name body")}`;
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

        let tag;

        try {
            tag = await getClient().tagManager.add(
                t_name,
                body,
                ctx.msg.author.id,
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

            switch (err.message) {
                case "Tag already exists":
                    const existingTag = err.ref,
                        owner = await existingTag.getOwner();

                    return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** already exists,${owner === "not found" ? " tag owner not found." : ` and is owned by \`${owner}\`.`}`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        let out = `${getEmoji("ok")} Created ${this.parentCmd.formatTagType(tag)} **${escapeMarkdown(t_name)}**.`;

        if (attachment) {
            out += `\n${this.parentCmd.attachmentWarning}`;
        }

        return out;
    }
}

export default TagAddCommand;
