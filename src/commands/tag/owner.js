import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagOwnerCommand {
    static info = {
        name: "owner",
        aliases: ["author"],
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

        let owner = await tag.getOwner(false, true, ctx.msg.guild.id);

        if (owner === null) {
            owner = await tag.getOwner(false);

            if (owner === null) {
                return `${getEmoji("warn")} Tag owner not found.`;
            }
        }

        let out = `${getEmoji("info")} Tag **${escapeMarkdown(t_name)}** is owned by \`${owner.user.username}\``;

        if (owner.nickname) {
            out += ` (also known as **${escapeMarkdown(owner.nickname)}**)`;
        }

        return out + ".";
    }
}

export default TagOwnerCommand;
