import { escapeMarkdown } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "add",
    aliases: ["create"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name body")}`;
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

        let parsed = await this.parentCmd.parseBase(t_args, msg),
            { body, type } = parsed;

        if (parsed.err !== null) {
            return parsed.err;
        } else {
            let err;
            [body, err] = getClient().tagManager.checkBody(body, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        try {
            await getClient().tagManager.add(t_name, body, msg.author.id, type, {
                validateNew: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            switch (err.message) {
                case "Tag already exists":
                    const tag = err.ref,
                        owner = await tag.getOwner();

                    const out = `:warning: Tag **${escapeMarkdown(t_name)}** already exists,`;
                    return out + (owner === "not found" ? " tag owner not found." : ` and is owned by \`${owner}\`.`);
                default:
                    return `:warning: ${err.message}.`;
            }
        }

        return `:white_check_mark: Created tag **${escapeMarkdown(t_name)}**.`;
    }
};
