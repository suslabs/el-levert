import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import DiscordUtil from "../../util/DiscordUtil.js";

class TagOwnerCommand {
    static info = {
        name: "owner",
        aliases: ["author"],
        parent: "tag",
        subcommand: true,
        args: "<name>",
        description: "Looks up the creator and current owner of a tag, displaying their username and Discord ID.",
        usage: "- <name>: The name of the tag to query.",
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

        let owner = await tag.getOwner(false, true, ctx.msg.guild.id);

        if (owner === null) {
            owner = await tag.getOwner(false);

            if (owner === null) {
                return `${getEmoji("warn")} Tag owner not found.`;
            }
        }

        let out = `${getEmoji("info")} Tag **${escapeMarkdown(t_name)}** is owned by ${DiscordUtil.formatUser(owner.user, null, true)}`;

        if (owner.nickname) {
            out += ` (also known as **${escapeMarkdown(owner.nickname)}**)`;
        }

        return out + ".";
    }
}

export default TagOwnerCommand;
