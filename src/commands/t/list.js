import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

function formatTagList(tags) {
    const format = tags.map((tag, i) => `${i + 1}. ` + tag.format()).join("\n");

    return format;
}

export default {
    name: "list",
    parent: "tag",
    subcommand: true,
    handler: async (args, msg) => {
        let owner = msg.author.id,
            username = msg.author.username;

        if (args.length > 0) {
            const find = (await getClient().findUsers(args))[0];

            if (typeof find === "undefined") {
                return `:warning: User \`${args}\` not found.`;
            }

            owner = find.user.id;
            username = find.user.username;
        }

        const tags = await getClient().tagManager.list(owner);

        if (tags.count === 0) {
            return `:information_source: User \`${username}\` has no tags.`;
        }

        let format = "";

        if (tags.newTags.length > 0) {
            format += `EL LEVERT tags:\n${formatTagList(tags.newTags)}`;
        }

        if (tags.oldTags.length > 0) {
            if (format.length > 0) {
                format += "\n\n";
            }

            format += `Leveret 1 tags:\n${formatTagList(tags.oldTags)}`;
        }

        return {
            content: `:information_source: User \`${username}\` has following tags:`,
            ...Util.getFileAttach(format)
        };
    }
};
