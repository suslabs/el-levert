import { escapeMarkdown } from "discord.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

class TagRevertCommand {
    static info = {
        name: "revert",
        args: "<name> [revision_id]",
        description:
            "Restores a tag to a previous revision or undoes the latest edit. Tag owners can revert their own latest actions within one hour; moderators can restore arbitrary revision IDs.",
        usage: "- <name>: The name of the tag to revert.\n- [revision_id]: Specific revision ID to restore (moderators only).",
        parser: {
            requireArgs: true
        },
        parent: "tag",
        subcommand: true,
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
        let t_name = ctx.arg("tagName");

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

            if (restored._currentTag != null && restored._currentTag.name !== restored.name) {
                return `${getEmoji("ok")} Reverted tag **${escapeMarkdown(restored._currentTag.name)}** to **${escapeMarkdown(restored.name)}**.`;
            }

            if (restored.name !== t_name) {
                return `${getEmoji("ok")} Reverted tag **${escapeMarkdown(t_name)}** to **${escapeMarkdown(restored.name)}**.`;
            }

            const restoredRev = restored._previousRevision ?? restored._targetRevision,
                revNum = restoredRev?.subjectIndex ?? revisionId;

            return `${getEmoji("ok")} Reverted tag **${escapeMarkdown(restored.name)}** to revision **#${revNum}**.`;
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }
    }
}

export default TagRevertCommand;
