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
        let user = msg.author;

        if (args.length > 0) {
            const [u_name] = Util.splitArgs(args),
                find = (await getClient().findUsers(u_name))[0];

            if (typeof find === "undefined") {
                return `:warning: User \`${u_name}\` not found.`;
            }

            user = find.user;
        }

        const tags = await getClient().tagManager.list(user.id);

        if (tags.count === 0) {
            if (user === msg.author) {
                return `:information_source: You have no tags.`;
            } else {
                return `:information_source: User \`${user.username}\` has no tags.`;
            }
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

        const out = {
            ...Util.getFileAttach(format)
        };

        if (user === msg.author) {
            out.content = `:information_source: You have the following tags:`;
        } else {
            out.content = `:information_source: User \`${user.username}\` has the following tags:`;
        }

        return out;
    }
};
