import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagDeleteCommand {
    static info = {
        name: "delete",
        aliases: ["remove"],
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name")}`;
        }

        let t_name = ctx.arg("tagName");

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
            return `${getEmoji("warn")} You can only delete your own tags.${owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`}`;
        }

        try {
            await getClient().tagManager.delete(tag);
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
