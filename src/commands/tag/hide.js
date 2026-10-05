import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

class TagHideCommand {
    static info = {
        name: "hide",
        parent: "tag",
        subcommand: true,
        args: "<name>",
        description:
            "Hides a tag so it does not appear in search results, listing, or auto-suggestions. Can still be retrieved directly or executed.",
        usage: "- <name>: The name of the tag to hide.",
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

        {
            const err = await this.parentCmd.checkOwner(tag, ctx, this.name);

            if (err !== null) {
                return err;
            }
        }

        try {
            await getClient().tagManager.hide(tag, false, {
                actor: ctx.msg.author.id
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Hid tag **${escapeMarkdown(t_name)}**.`;
    }
}

export default TagHideCommand;
