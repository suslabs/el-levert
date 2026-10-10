import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class TagChownCommand {
    static info = {
        name: "chown",
        aliases: ["transfer"],
        parent: "tag",
        subcommand: true,
        args: "<name> <new_owner>",
        description:
            "Transfers ownership of a tag to another user. Only the current tag owner or server moderators have permission to change tag ownership.",
        usage: "- <name>: Target tag to transfer.\n- <new_owner>: Username, mention, or Discord ID of the recipient.",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "ownerText",
                kind: "positional",
                index: 1
            }
        ]
    };

    async handler(ctx) {
        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("ownerText");

        {
            const err = this.parentCmd.checkCommand(t_name);

            if (err !== null) {
                return err;
            }
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        if (Util.empty(t_args)) {
            return `${getEmoji("warn")} Invalid target user. You must specifically mention the target user.`;
        }

        const find = Util.first(await getClient().findUsers(t_args));

        if (typeof find === "undefined") {
            return `${getEmoji("warn")} User \`${t_args}\` not found.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        {
            const err = await this.parentCmd.checkOwner(tag, ctx, "edit");

            if (err !== null) {
                return err;
            }
        }

        try {
            await getClient().tagManager.chown(tag, find.user.id, false, {
                actor: ctx.msg.author.id
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Transferred tag **${escapeMarkdown(t_name)}** to ${DiscordUtil.formatUser(find.user, null, true)}.`;
    }
}

export default TagChownCommand;
