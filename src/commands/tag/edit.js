import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagEditCommand {
    static info = {
        name: "edit",
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: true
            },
            {
                name: "tagArgs",
                parser: "split",
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

        if (tag.owner !== ctx.msg.author.id && !getClient().permManager.allowed(ctx.perm, "mod")) {
            const owner = await tag.getOwner();
            return `${getEmoji("warn")} You can only edit your own tags.${owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`}`;
        }

        let parsed = await this.parentCmd.parseBase(t_args, ctx.msg),
            { body, type } = parsed;

        if (parsed.err !== null) {
            return parsed.err;
        }

        {
            let err;
            [body, err] = getClient().tagManager.checkBody(body, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        try {
            await getClient().tagManager.edit(tag, body, type, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Edited tag **${escapeMarkdown(t_name)}**.`;
    }
}

export default TagEditCommand;
