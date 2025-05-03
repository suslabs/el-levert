import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

function formatGroups(groups) {
    if (Util.multiple(groups)) {
        const format = groups.map((group, i) => `${i + 1}. ${group.format(true)}`);
        return format.join("\n");
    } else {
        return Util.first(groups).format();
    }
}

function codeblock(str) {
    return `\`\`\`\n${str}\`\`\``;
}

export default {
    name: "check",
    parent: "perm",
    subcommand: true,

    handler: async (args, msg) => {
        let user = msg.author;

        if (!Util.empty(args)) {
            const [u_name] = ParserUtil.splitArgs(args),
                find = Util.first(await getClient().findUsers(u_name));

            if (typeof find === "undefined") {
                user = {
                    id: u_name,
                    username: u_name
                };
            } else {
                user = find.user;
            }
        }

        const groups = await getClient().permManager.fetch(user.id);

        if (groups === null) {
            if (user === msg.author) {
                return `:information_source: You have **no** permissions.`;
            } else {
                return `:information_source: User \`${user.username}\` has **no** permissions.`;
            }
        }

        let header;

        if (user === msg.author) {
            header = ":information_source: You have the following permissions:";
        } else {
            header = `:information_source: User \`${user.username}\` has the following permissions:`;
        }

        const format = formatGroups(groups),
            maxLevel = await getClient().permManager.maxLevel(user.id);

        const embed = new EmbedBuilder().setTitle(`Level: **${maxLevel}**`).setDescription(codeblock(format));

        return {
            content: header,
            embeds: [embed]
        };
    }
};
