import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "edit",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name new_body")}`;
        }

        let [t_name, t_args] = ParserUtil.splitArgs(args, true);

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

        if (tag.owner !== msg.author.id && !getClient().permManager.allowed(perm, "mod")) {
            const out = `:warning: You can only edit your own tags.`,
                owner = await tag.getOwner();

            return out + (owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`);
        }

        let parsed = await this.parentCmd.parseBase(t_args, msg),
            { body, type } = parsed;

        if (parsed.err !== null) {
            return parsed.err;
        } else {
            let err;
            [body, err] = getClient().tagManager.checkBody(body, false);

            if (err !== err) {
                return `:warning: ${err}.`;
            }
        }

        try {
            await getClient().tagManager.edit(tag, body, type, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `:warning: ${err.message}.`;
        }

        return `:white_check_mark: Edited tag **${escapeMarkdown(t_name)}**.`;
    }
};
