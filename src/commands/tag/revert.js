import { escapeMarkdown } from "discord.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRevertCommand {
    static info = {
        name: "revert",
        parent: "tag",
        subcommand: true,
        description: "Restore a tag to a previous revision.",
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "revisionId",
                kind: "positional",
                index: 1,
                type: "integer"
            }
        ]
    };

    load() {
        return getConfig().enableAuditLog;
    }

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("name [revision_id]")}`;
        }

        let t_name = ctx.arg("tagName");

        if (this.matchesSubcmd(t_name)) {
            return `${getEmoji("invalid")} **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        const revisionId = ctx.arg("revisionId"),
            mod = getClient().permManager.allowed(ctx.perm, "mod");

        try {
            const restored = await getClient().tagManager.revert(t_name, revisionId, ctx.msg.author.id, {
                actor: ctx.msg.author.id,
                mod
            });

            if (restored === null) {
                return `${getEmoji("ok")} Reverted tag **${escapeMarkdown(t_name)}** by deleting it.`;
            }

            return `${getEmoji("ok")} Reverted tag **${escapeMarkdown(t_name)}** to **${escapeMarkdown(restored.name)}**.`;
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }
    }
}

export default TagRevertCommand;
