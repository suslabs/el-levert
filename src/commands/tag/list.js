import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

function formatTagList(tags) {
    const format = tags.map((tag, i) => `${i + 1}. ${tag.format()}`);
    return format.join("\n");
}

export default {
    name: "list",
    parent: "tag",
    subcommand: true,

    handler: async (args, msg) => {
        let user = msg.author;

        if (!Util.empty(args)) {
            const [u_name] = Util.splitArgs(args),
                find = Util.first(await getClient().findUsers(u_name));

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

        if (!Util.empty(tags.newTags)) {
            format += `EL LEVERT tags:\n${formatTagList(tags.newTags)}`;
        }

        if (!Util.empty(tags.oldTags)) {
            if (!Util.empty(format)) {
                format += "\n\n";
            }

            format += `OG Leveret tags:\n${formatTagList(tags.oldTags)}`;
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
