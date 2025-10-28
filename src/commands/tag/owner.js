import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "owner",
    aliases: ["author"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name")}`;
        }

        let [t_name] = ParserUtil.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        let owner = await tag.getOwner(false, true, msg.guild.id);

        if (owner === null) {
            owner = await tag.getOwner(false);

            if (owner === null) {
                return ":warning: Tag owner not found.";
            }
        }

        let out = `:information_source: Tag **${escapeMarkdown(t_name)}** is owned by \`${owner.user.username}\``;

        if (owner.nickname) {
            out += ` (also known as **${escapeMarkdown(owner.nickname)}**)`;
        }

        return out + ".";
    }
};
