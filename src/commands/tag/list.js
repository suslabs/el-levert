import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import TextCommand from "../../structures/command/TextCommand.js";

function formatTagList(tags) {
    const format = tags.map((tag, i) => `${i + 1}. ${tag.format()}`);
    return format.join("\n");
}

export default {
    name: "list",
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg) {
        let user = msg.author;

        if (!Util.empty(args)) {
            const [u_name] = ParserUtil.splitArgs(args),
                find = Util.first(await getClient().findUsers(u_name));

            if (typeof find === "undefined") {
                return `:warning: User \`${u_name}\` not found.`;
            }

            user = find.user;
        }

        const tags = await getClient().tagManager.list(user.id);

        if (tags.count < 1) {
            if (user === msg.author) {
                const dumpCmd = TextCommand.prototype.getArgsHelp.call(this.getSubcmd("dump"));
                return `:information_source: You don't have any tags. If you want to see the list of all available tags, use \`${dumpCmd}\`.`;
            } else {
                return `:information_source: User \`${user.username}\` has **no** tags.`;
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
            ...DiscordUtil.getFileAttach(format)
        };

        if (user === msg.author) {
            out.content = `:information_source: You have the following tags:`;
        } else {
            out.content = `:information_source: User \`${user.username}\` has the following tags:`;
        }

        return out;
    }
};
