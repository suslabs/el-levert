import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

function formatTagList(tags) {
    return tags.map((x, i) => {
        let name = `${i + 1}. ${x.name}`;

        if(x.hops.length > 1) {
            name += `(-> ${x.hops[1]} ${x.args})`;
        }

        return name;
    }).join("\n");
}

export default {
    name: "list",
    parent: "t",
    subcommand: true,
    handler: async (args, msg) => {
        let owner = msg.author.id,
            tag = msg.author.tag;

        if(args.length > 0) {
            const find = (await getClient().findUsers(args))[0].user;

            owner = find.id;
            tag = find.tag;
        }

        const tags = await getClient().tagManager.list(owner);
        
        if(tags.count === 0) {
            return `:information_source: User \`${tag}\` has no tags.`;
        }
        
        let format = "";
        
        if(tags.newTags.length > 0) {
            format += `EL LEVERT tags:\n${formatTagList(tags.newTags)}`;
        }
        
        if(tags.oldTags.length > 0) {
            if(format.length > 0) {
                format += "\n\n";
            }

            format += `Leveret 1 tags:\n${formatTagList(tags.oldTags)}`;
        }
        
        return {
            content: `:information_source: User \`${tag}\` has following tags:`,
            ...Util.getFileAttach(format)
        };
    }
}