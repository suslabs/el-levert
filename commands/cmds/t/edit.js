import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "edit",
    parent: "tag",
    subcommand: true,
    handler: async function(args, msg, perm) {
        if(args.length === 0) {
            return ":information_source: `t edit name body`";
        }

        const [t_name, t_args] = Util.splitArgs(args),
              [t_type, t_body] = Util.splitArgs(t_args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }

        if(this.parentCmd.subcommands.includes(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if(!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if(perm < 1 && tag.owner !== msg.author.id) {
            const owner = await getClient().tagManager.ownerTag(tag);
            
            return `:warning: You can only edit your own tags. Tag is owned by \`${owner}\`.`;
        }

        if(typeof t_args === "undefined" || t_args.length < 1 && msg.attachments.size < 1) {
            return ":warning: Tag body is empty.";
        }

        let body = t_args, isScript, scriptType = 0;
        
        if(t_type === "vm2") {
            body = t_body;
            scriptType = 1;
        }

        if(msg.attachments.size > 0) {
            try {
                [body, isScript] = await getClient().tagManager.downloadBody(msg);
            } catch(err) {
                if(err.name === "TagError") {
                    return ":warning: " + err.message;
                }

                return {
                    content: ":no_entry_sign: Downloading attachment failed:",
                    ...Util.getFileAttach(err.stack, "error.js")
                }
            }
        }

        try {
            await getClient().tagManager.edit(tag, body, isScript, scriptType);
        } catch(err) {
            if(err.name === "TagError") {
                return ":warning: " + err.message;
            }

            throw err;
        }

        let out = "";

        if((tag.type & 1) === 0) {
            out = `:warning: Tag has been converted to EL LEVERT format. Updates on Leveret 1 will no longer apply.
To reverse this, delete the tag and wait for the next db sync.\n\n`;
        }

        return out + `:white_check_mark: Edited tag **${t_name}**.`;
    }
}