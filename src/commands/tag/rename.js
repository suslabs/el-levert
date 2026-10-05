import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRenameCommand {
    static info = {
        name: "rename",
        parent: "tag",
        subcommand: true,
        args: "<name> <new_name>",
        description:
            "Renames a tag to a new identifier and automatically updates all alias pointers referencing the old name. Only the tag owner or moderators can rename a tag.",
        usage: "- <name>: Current name of the tag to rename.\n- <new_name>: New unique name for the tag.",
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
                name: "newName",
                kind: "positional",
                index: 1,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            n_name = ctx.arg("newName");

        {
            const err = this.parentCmd.checkCommand(t_name);

            if (err !== null) {
                return err;
            }
        }

        {
            let err1, err2;
            [t_name, err1] = getClient().tagManager.checkName(t_name, false);
            [n_name, err2] = getClient().tagManager.checkName(n_name, false);

            if (err1 !== null || err2 !== null) {
                return `${getEmoji("warn")} ${err1 ?? err2}.`;
            }
        }

        if (Util.empty(n_name)) {
            return `${getEmoji("warn")} You must specify the new tag name.`;
        }

        {
            const err = this.parentCmd.checkCommand(n_name);

            if (err !== null) {
                return err;
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
            await getClient().tagManager.rename(
                tag,
                n_name,
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

                    return `${getEmoji("warn")} Tag **${escapeMarkdown(existingTag.name)}** already exists,${owner === "not found" ? " tag owner not found." : ` and is owned by \`${owner}\`.`}`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        return `${getEmoji("ok")} Renamed tag **${escapeMarkdown(t_name)}** to **${escapeMarkdown(n_name)}**.`;
    }
}

export default TagRenameCommand;
