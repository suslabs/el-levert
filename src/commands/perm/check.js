import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

function formatGroups(groups) {
    if (Util.multiple(groups)) {
        const format = groups.map((group, i) => `${i + 1}. ${group.format(true)}`);
        return format.join("\n");
    }

    return Util.first(groups).format();
}

function codeblock(str) {
    return `\`\`\`\n${str}\`\`\``;
}

class PermCheckCommand {
    static info = {
        name: "check",
        parent: "perm",
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

            user = find?.user ?? {
                id: u_name,
                username: u_name
            };
        }

        const groups = await getClient().permManager.fetch(user.id);

        if (groups === null) {
            if (user === ctx.msg.author) {
                return `${getEmoji("info")} You have **no** permissions.`;
            }

            return `${getEmoji("info")} User \`${user.username}\` has **no** permissions.`;
        }

        const header =
            user === ctx.msg.author
                ? `${getEmoji("info")} You have the following permissions:`
                : `${getEmoji("info")} User \`${user.username}\` has the following permissions:`;

        const format = formatGroups(groups),
            maxLevel = await getClient().permManager.maxLevel(user.id);

        const embed = new EmbedBuilder().setTitle(`Level: **${maxLevel}**`).setDescription(codeblock(format));

        return {
            content: header,
            embeds: [embed]
        };
    }
}

export default PermCheckCommand;
