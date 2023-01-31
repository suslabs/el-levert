import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "check",
    parent: "perm",
    subcommand: true,
    handler: async (args, msg) => {
        if(args.length === 0) {
            return ":information_source: `perm check [username]`";
        }

        let [u_name] = Util.splitArgs(args);
        
        let user = (await getClient().findUsers(u_name))[0].user,
            format = "";
        
        if(!user) {
            user = {
                id: u_name,
                tag: u_name
            };
        }

        const groups = await getClient().permManager.fetch(user.id);
        
        if(!groups) {
            return `:information_source: User \`${user.tag}\` has no permissions.`;
        }

        if(groups.length > 1) {
            format = groups.map((x, i) => `${i + 1}. ${x.name} - ${x.level}`);
        } else {
            format = `${groups[0].name} - ${groups[0].level}`;
        }

        const maxLevel = Math.max(...groups.map(x => x.level));

        return `User \`${user.tag}\` has permissions:
\`\`\`
${format}
\`\`\`
Level: ${maxLevel}`;
    }
}