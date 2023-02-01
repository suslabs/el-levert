import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "chown",
    parent: "t",
    subcommand: true,
    handler: async function(args, msg, perm) {
        if(args.length === 0) {
            return ":information_source: `t chown name new_owner_mention`";
        }

        const [t_name, t_args] = Util.splitArgs(args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }
        
        if(t_args.length === 0) {
            return ":warning: Invalid target user. You must specifically mention the target user.";
        }

        const newOwner = (await getClient().findUsers(t_args))[0].user;

        if(!newOwner) {
            return `:warning: User \`${t_args}\` not found.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if(!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if(perm < 1 && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                  out = ":warning: You can only chown your own tags.";

            if(!owner) {
                return out + " Tag owner not found.";
            }
            
            return out + ` Tag is owned by \`${owner.tag}\`.`;
        }

        await getClient().tagManager.chown(tag, newOwner.id);

        let out = "";

        if((tag.type & 1) === 0) {
            out = ":warning: Tag has been converted to EL LEVERT format. Updates on Leveret 1 will no longer apply.\n\n";
        }

        return out + `:white_check_mark: Transferred tag **${t_name}** to ${t_args}.`;
    }
}