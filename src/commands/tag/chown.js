import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagChownCommand {
    static info = {
        name: "chown",
        aliases: ["transfer"],
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
                name: "ownerText",
                parser: "split",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name new_owner")}`;
        }

        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("ownerText");

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

        if (Util.empty(t_args)) {
            return `${getEmoji("warn")} Invalid target user. You must specifically mention the target user.`;
        }

        const find = Util.first(await getClient().findUsers(t_args));

        if (typeof find === "undefined") {
            return `${getEmoji("warn")} User \`${t_args}\` not found.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        if (tag.owner !== ctx.msg.author.id && !getClient().permManager.allowed(ctx.perm, "mod")) {
            const owner = await tag.getOwner();
            return `${getEmoji("warn")} You can only edit your own tags.${owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`}`;
        }

        try {
            await getClient().tagManager.chown(tag, find.user.id);
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Transferred tag **${escapeMarkdown(t_name)}** to \`${find.user.username}\`.`;
    }
}

export default TagChownCommand;
