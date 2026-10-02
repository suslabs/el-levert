import { escapeMarkdown } from "discord.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import PermissionRevisionTargets from "../../managers/database/revision/PermissionRevisionTargets.js";

import PositionalCommandReader from "../../parsers/command/reader/PositionalCommandReader.js";

import Util from "../../util/Util.js";

class PermRevertCommand {
    static info = {
        name: "revert",
        parent: "perm",
        subcommand: true,
        allowed: "admin",
        description: "Restore a permission group or membership to a previous revision.",
        arguments: [
            {
                name: "targetType",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "revertData",
                kind: "rest"
            }
        ]
    };

    load() {
        return getConfig().enableAuditLog;
    }

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("group group_name [revision_id] | membership user_id/group_name [revision_id]")}`;
        }

        const args = this._parseArgs(ctx.arg("revertData"));

        if (args === null) {
            return `${getEmoji("info")} ${this.getArgsHelp("group group_name [revision_id] | membership user_id/group_name [revision_id]")}`;
        }

        const { revisionId, subject } = args,
            targetType = ctx.arg("targetType"),
            target = this._getTarget(targetType, subject);

        if (target === null) {
            return targetType === "membership"
                ? `${getEmoji("warn")} Membership must use the form **user_id/group_name**.`
                : `${getEmoji("warn")} Target must be **group** or **membership**.`;
        }

        try {
            const restored = await getClient().permManager.revert(target, revisionId, ctx.msg.author.id, {
                actor: ctx.msg.author.id
            });

            if (restored === null) {
                return `${getEmoji("ok")} Reverted the permission subject by deleting it.`;
            }

            const label =
                target.target === PermissionRevisionTargets.user
                    ? `${restored.user} in ${restored.group}`
                    : restored.name;

            return `${getEmoji("ok")} Reverted permission subject **${escapeMarkdown(label)}**.`;
        } catch (err) {
            if (err.name !== "PermissionError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }
    }

    _parseArgs(data) {
        const [subject, remaining] = PositionalCommandReader.split(data);

        if (Util.empty(subject)) {
            return null;
        }

        const [revisionText, extra] = PositionalCommandReader.split(remaining);

        if (!Util.empty(extra)) {
            return null;
        }

        if (Util.empty(revisionText)) {
            return {
                subject,
                revisionId: null
            };
        }

        const revisionId = Number(revisionText);

        return Number.isInteger(revisionId) ? { subject, revisionId } : null;
    }

    _getTarget(targetType, subject) {
        switch (targetType) {
            case "group":
                return {
                    target: PermissionRevisionTargets.group,
                    name: subject
                };
            case "membership":
                return this._getMembershipTarget(subject);
            default:
                return null;
        }
    }

    _getMembershipTarget(subject) {
        if (Util.empty(subject)) {
            return null;
        }

        const parts = subject.split("/");

        if (parts.length !== 2 || Util.empty(parts[0]) || Util.empty(parts[1])) {
            return null;
        }

        return {
            target: PermissionRevisionTargets.user,
            user: parts[0],
            group: parts[1]
        };
    }
}

export default PermRevertCommand;
