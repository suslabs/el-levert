import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

function formatTagList(tags) {
    return tags.map((tag, i) => `${i + 1}. ${tag.format()}`).join("\n");
}

class TagListCommand {
    static info = {
        name: "list",
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "userName",
                parser: "split",
                index: 0
            }
        ]
    };

    async handler(ctx) {
        let user = ctx.msg.author;

        if (!Util.empty(ctx.argsText)) {
            const u_name = ctx.arg("userName"),
                find = Util.first(await getClient().findUsers(u_name));

            if (typeof find === "undefined") {
                return `${getEmoji("warn")} User \`${u_name}\` not found.`;
            }

            user = find.user;
        }

        const tags = await getClient().tagManager.list(user.id);

        if (tags.count < 1) {
            if (user === ctx.msg.author) {
                return `${getEmoji("info")} You don't have any tags. If you want to see the list of all available tags, use \`${this.getSubcmd("dump").getArgsHelp()}\`.`;
            }

            return `${getEmoji("info")} User \`${user.username}\` has **no** tags.`;
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

        return {
            content: `${getEmoji("info")} ${user === ctx.msg.author ? "You have" : `User \`${user.username}\` has`} the following tags:`,
            ...DiscordUtil.getFileAttach(format)
        };
    }
}

export default TagListCommand;
