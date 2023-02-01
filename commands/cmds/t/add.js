import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "add",
    parent: "t",
    subcommand: true,
    handler: async function(args, msg) {
        const [t_name, t_args] = Util.splitArgs(args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }
        
        if(this.parentCmd.subNames.includes(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        if(typeof t_args === "undefined" || t_args.length < 1 && msg.attachments.size < 1) {
            return ":warning: Tag body is empty.";
        }
        
        const tag = await getClient().tagManager.fetch(t_name);
        
        if(tag) {
            const owner = await getClient().findUserById(tag.owner),
                  out = `:warning: Tag **${t_name}** already exists,`;

            if(!owner) {
                return out + " tag owner not found.";
            }
            
            return out + ` and is owned by \`${owner.tag}\``;
        }

        let body = t_args, isScript;

        if(msg.attachments.size > 0) {
            try {
                [body, isScript] = await getClient().tagManager.downloadBody(msg);
            } catch(err) {
                if(err.name === "TagError") {
                    return ":warning: " + err.message;
                }

                return `:warning: Downloading attachment failed:
\`\`\`js
${err.message}
\`\`\``;
            }
        }

        try {
            await getClient().tagManager.add(t_name, body, msg.author.id, isScript);
        } catch(err) {
            if(err.name === "TagError") {
                return ":warning: " + err.message;
            }

            throw err;
        }

        return `:white_check_mark: Created tag **${t_name}**.`;
    }
}