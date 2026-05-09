import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagAliasCommand {
    static info = {
        name: "alias",
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
            },
            {
                name: "aliasName",
                from: "tagArgs",
                parser: "split",
                index: 0,
                lowercase: true
            },
            {
                name: "aliasArgs",
                from: "tagArgs",
                parser: "split",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name other_tag [args]")}`;
        }

        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("tagArgs"),
            a_name = ctx.arg("aliasName"),
            a_args = ctx.arg("aliasArgs");

        if (this.matchesSubcmd(t_name)) {
            return `${getEmoji("invalid")} **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        if (Util.empty(a_name)) {
            return `${getEmoji("warn")} Alias target must be specified. If you want to de-alias the tag, \`edit\` it.`;
        }

        {
            let err1, err2;
            [t_name, err1] = getClient().tagManager.checkName(t_name, false);
            [a_name, err2] = getClient().tagManager.checkName(a_name, false);

            if (err1 !== null || err2 !== null) {
                return `${getEmoji("warn")} ${err1 ?? err2}.`;
            }
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag !== null && tag.owner !== ctx.msg.author.id && !getClient().permManager.allowed(ctx.perm, "mod")) {
            const owner = await tag.getOwner();
            return `${getEmoji("warn")} You can only edit your own tags.${owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`}`;
        }

        const a_tag = await getClient().tagManager.fetch(a_name);

        if (!a_tag) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(a_name)}** doesn't exist.`;
        }

        const createOptions = {
            name: t_name,
            owner: ctx.msg.author.id
        };

        let created = false;

        try {
            [, created] = await getClient().tagManager.alias(tag, a_tag, a_args, createOptions, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        const out = created ? `Created tag **${escapeMarkdown(t_name)}** and aliased` : "Aliased";
        return `${getEmoji("ok")} ${out} tag **${escapeMarkdown(t_name)}** to **${escapeMarkdown(a_name)}**.`;
    }
}

export default TagAliasCommand;
