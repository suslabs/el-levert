import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagAliasCommand {
    static info = {
        name: "alias",
        args: "<name> <target_tag> [args]",
        description:
            "Creates or updates an alias pointing to another tag or a stream pipeline. When invoked, arguments are passed along to the target tag, supporting parameter interpolation and multi-hop aliases.",
        usage: "- <name>: The alias name to create or update.\n- <target_tag>: Target tag name or stream/pipe command to forward execution to.\n- [args]: Optional default arguments supplied to the target tag.",
        parser: {
            requireArgs: true
        },
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
            },
            {
                name: "aliasName",
                from: "tagArgs",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "aliasArgs",
                from: "tagArgs",
                kind: "positional",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            a_name = ctx.arg("aliasName"),
            a_args = ctx.arg("aliasArgs");

        {
            const err = this.parentCmd.checkCommand(t_name);

            if (err !== null) {
                return err;
            }
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

        {
            const err = await this.parentCmd.checkOwner(tag, ctx, "edit");

            if (err !== null) {
                return err;
            }
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
            [, created] = await getClient().tagManager.alias(
                tag,
                a_tag,
                a_args,
                createOptions,
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

        const out = created ? `Created tag **${escapeMarkdown(t_name)}** and aliased` : "Aliased";
        return `${getEmoji("ok")} ${out} tag **${escapeMarkdown(t_name)}** to **${escapeMarkdown(a_name)}**.`;
    }
}

export default TagAliasCommand;
