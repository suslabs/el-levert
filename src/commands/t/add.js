import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "add",
    aliases: ["create"],
    parent: "tag",
    subcommand: true,
    handler: async function (args, msg) {
        const [t_name, t_args] = Util.splitArgs(args);

        if (this.isSubName(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        const parsed = await this.parentCmd.parseBase(t_args, msg),
            { body, type } = parsed;

        if (typeof parsed.err !== "undefined") {
            return parsed.err;
        }

        try {
            await getClient().tagManager.add(t_name, body, msg.author.id, type);
        } catch (err) {
            if (err.name === "TagError") {
                switch (err.message) {
                    case "Tag already exists":
                        const tag = err.ref,
                            owner = await getClient().findUserById(tag.owner),
                            out = `:warning: Tag **${t_name}** already exists,`;

                        if (!owner) {
                            return `${out} tag owner not found.`;
                        }

                        return `${out} and is owned by \`${owner.username}\``;
                    default:
                        return `:warning: ${err.message}.`;
                }
            }

            throw err;
        }

        return `:white_check_mark: Created tag **${t_name}**.`;
    }
};
