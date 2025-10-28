import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "alias",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name other_tag [args]")}`;
        }

        let [t_name, t_args] = ParserUtil.splitArgs(args, true),
            [a_name, a_args] = ParserUtil.splitArgs(t_args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        if (Util.empty(a_name)) {
            return ":warning: Alias target must be specified. If you want to de-alias the tag, `edit` it.";
        }

        {
            let err1, err2;
            [t_name, err1] = getClient().tagManager.checkName(t_name, false);
            [a_name, err2] = getClient().tagManager.checkName(a_name, false);

            if (err1 !== null || err2 !== null) {
                return `:warning: ${err1 ?? err2}.`;
            }
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag !== null && tag.owner !== msg.author.id && !getClient().permManager.allowed(perm, "mod")) {
            const out = `:warning: You can only edit your own tags.`,
                owner = await tag.getOwner();

            return out + (owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`);
        }

        const a_tag = await getClient().tagManager.fetch(a_name);

        if (!a_tag) {
            return `:warning: Tag **${escapeMarkdown(a_name)}** doesn't exist.`;
        }

        const createOptions = {
            name: t_name,
            owner: msg.author.id
        };

        let created = false;

        try {
            [, created] = await getClient().tagManager.alias(tag, a_tag, a_args, createOptions, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `:warning: ${err.message}.`;
        }

        const out = created ? `Created tag **${escapeMarkdown(t_name)}** and aliased` : "Aliased";
        return `:white_check_mark: ${out} tag **${escapeMarkdown(t_name)}** to **${escapeMarkdown(a_name)}**.`;
    }
};
