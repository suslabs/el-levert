import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

class TagDeleteCommand {
    static info = {
        name: "delete",
        aliases: ["remove"],
        parent: "tag",
        subcommand: true,
        args: "<name>",
        description: "Deletes a tag from the database. Only the tag owner or moderators can delete a tag.",
        usage: "- <name>: The name of the tag to delete.",
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
            await getClient().tagManager.delete(tag, false, {
                actor: ctx.msg.author.id
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Deleted tag **${escapeMarkdown(t_name)}**.`;
    }
}

export default TagDeleteCommand;
