import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRenameCommand {
    static info = {
        name: "rename",
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
                name: "newName",
                parser: "split",
                index: 1,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name new_name")}`;
        }

        let t_name = ctx.arg("tagName"),
            n_name = ctx.arg("newName");

        if (this.matchesSubcmd(t_name)) {
            return `${getEmoji("invalid")} **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
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

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        if (tag.owner !== ctx.msg.author.id && !getClient().permManager.allowed(ctx.perm, "mod")) {
            const owner = await tag.getOwner();
            return `${getEmoji("warn")} You can only rename your own tags.${owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`}`;
        }

        try {
            await getClient().tagManager.rename(tag, n_name, {
                validateNew: false
            });
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
