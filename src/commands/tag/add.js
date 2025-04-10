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

        const [t_name, t_args] = ParserUtil.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return `:warning: ${err}.`;
        }

        const parsed = await this.parentCmd.parseBase(t_args, msg),
            { body, type } = parsed;

        if (parsed.err !== null) {
            return parsed.err;
        }

        try {
            await getClient().tagManager.add(t_name, body, msg.author.id, type);
        } catch (err) {
            if (err.name === "TagError") {
                switch (err.message) {
                    case "Tag already exists":
                        const out = `:warning: Tag **${t_name}** already exists,`;

                        const tag = err.ref,
                            owner = await tag.getOwner();

                        if (owner === "not found") {
                            return out + " tag owner not found.";
                        } else {
                            return out + ` and is owned by \`${owner}\`.`;
                        }
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        return `:white_check_mark: Created tag **${t_name}**.`;
    }
};
