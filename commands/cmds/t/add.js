import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "add",
    parent: "tag",
    subcommand: true,
    handler: async function (args, msg) {
        const [t_name, t_args] = Util.splitArgs(args),
            [t_type, t_body] = Util.splitArgs(t_args),
            e = getClient().tagManager.checkName(t_name);

        if (e) {
            return ":warning: " + e;
        }

        if (this.parentCmd.subcommands.includes(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        if (typeof t_args === "undefined" || (t_args.length < 1 && msg.attachments.size < 1)) {
            return ":warning: Tag body is empty.";
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag) {
            const owner = await getClient().findUserById(tag.owner),
                out = `:warning: Tag **${t_name}** already exists,`;

            if (!owner) {
                return out + " tag owner not found.";
            }

            return out + ` and is owned by \`${owner.username}\``;
        }

        let body = t_args,
            isScript,
            scriptType = 0;

        if (t_type === "vm2") {
            body = t_body;
            scriptType = 1;
        }

        if (msg.attachments.size > 0) {
            try {
                [body, isScript] = await getClient().tagManager.downloadBody(msg);
            } catch (err) {
                if (err.name === "TagError") {
                    return ":warning: " + err.message;
                }

                return {
                    content: ":no_entry_sign: Downloading attachment failed:",
                    ...Util.getFileAttach(err.stack, "error.js")
                };
            }
        }

        try {
            await getClient().tagManager.add(t_name, body, msg.author.id, isScript, scriptType);
        } catch (err) {
            if (err.name === "TagError") {
                return ":warning: " + err.message;
            }

            throw err;
        }

        return `:white_check_mark: Created tag **${t_name}**.`;
    }
};
