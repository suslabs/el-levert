import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "delete",
    parent: "t",
    subcommand: true,
    handler: async function(args, msg, perm) {
        if(args.length === 0) {
            return ":information_source: `t delete name`";
        }

        const [t_name] = Util.splitArgs(args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }

        if(this.parentCmd.subNames.includes(t_name)) {
            return `:police_car: ${t_name} is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if(!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if(perm < 1 && tag.owner !== msg.author.id) {
            const owner = await getClient().findUserById(tag.owner),
                  out = ":warning: You can only delete your own tags.";

            if(!owner) {
                return out + " Tag owner not found.";
            }
            
            return out + ` Tag is owned by \`${owner.tag}\`.`;
        }

        await getClient().tagManager.delete(tag);

        let out = "";

        if((tag.type & 1) === 0) {
            out = ":warning: Leveret 1 tags will reappear on the next database sync.\n\n";
        }

        return out + `:white_check_mark: Deleted tag **${t_name}**.`;
    }
}