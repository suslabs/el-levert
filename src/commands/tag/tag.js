import { escapeMarkdown } from "discord.js";

import { MessageLimitTypes } from "../../handlers/discord/MessageLimitTypes.js";

import Tag from "../../structures/tag/Tag.js";
import { TagTypes } from "../../structures/tag/TagTypes.js";

import FakeTagRegistry from "../../managers/database/FakeTagRegistry.js";

import { getClient, getConfig, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import EmulationCommandUtil from "../../util/commands/EmulationCommandUtil.js";
import getInspectorAttachOutput from "../../util/vm/getInspectorAttachOutput.js";

import PositionalCommandReader from "../../parsers/command/reader/PositionalCommandReader.js";

const dummyMsg = {
    attachments: new Map()
};

function getReplyData(out) {
    let options = null;

    if (Array.isArray(out) && !Util.empty(out)) {
        const obj = Util.last(out);

        if (TypeTester.isObject(obj) && obj.type === "options") {
            options = out.pop();
        }
    }

    return [Array.isArray(out) && Util.single(out) ? Util.first(out) : out, options ?? undefined];
}

class TagCommand {
    static info = {
        name: "tag",
        aliases: ["t"],
        args: "<name> [args]",
        description: `Create, manage, and execute tags and scripts. When called with a tag name, executes the tag and passes any additional text as arguments.

Subcommands:
- add <name> [body]: Create a new tag.
- edit <name> [body]: Edit an existing tag's body.
- delete <name>: Delete a tag.
- rename <name> <new_name>: Rename a tag.
- alias <name> <target> [args]: Create an alias to another tag or stream.
- aliases <name>: List all aliases pointing to a tag.
- raw <name>: Show the stored body/script of a tag without executing it.
- uses <name>: Show how many times a tag has been used.
- stream <tag1 > tag2 > ...>: Execute a pipeline of tags/operators.
- audit [tag_name] [revision_id] [--options]: View revision history or diff.
- audit_clear [tag_name] [revision_id] [end_revision_id] [--options]: Clear tag audit history (owner only).
- revert <name> [revision_id]: Restore a previous tag state.
- info <name> [default|json|raw]: Show tag details and metadata (moderators).
- list [user]: List your tags or another user's tags.
- search <text> [limit]: Search tag names.
- fullsearch <query> [limit]: Search inside tag bodies.
- leaderboard (count/size/usage) [limit]: Show tag leaderboards.
- quota: Check your tag storage quota.
- chown <name> <new_owner>: Transfer tag ownership.
- hide <name> / unhide <name>: Hide or unhide a tag.
- random [prefix]: Execute a random tag matching prefix.
- count [scope]: Count tags by scope/type.
- dump [inline/full] [spaces]: Export tag database (full sends JSON file).
- set_type <name> <type|version>: Set script tag type/version (moderators).`,
        usage: "- <name>: Name of the tag to execute.\n- [args]: Optional arguments passed to the tag.",
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "tagArgs",
                kind: "positional",
                index: 1
            }
        ],
        subcommands: [
            "add",
            "alias",
            "aliases",
            "audit",
            "audit_clear",
            "chown",
            "count",
            "delete",
            "dump",
            "edit",
            "fullsearch",
            "hide",
            "info",
            "leaderboard",
            "list",
            "owner",
            "pipe",
            "quota",
            "random",
            "raw",
            "revert",
            "rename",
            "search",
            "set_type",
            "stream",
            "unhide",
            "uses"
        ]
    };

    attachmentWarning =
        "**Heads-up! Discord-hosted images disappear if the original message that provided them is deleted.**";

    matchesSubcmd(name, checkAliases = true) {
        return this.getSubcmdNames(checkAliases).includes(name) || FakeTagRegistry.has(name);
    }

    canUseFilePath(ctx) {
        return getClient().permManager.isOwner(ctx.author.id);
    }

    async parseBase(t_args, contextOrMsg, options) {
        options = ObjectUtil.guaranteeObject(options);

        const [t_type, t_body] = PositionalCommandReader.split(t_args, {
            lowercase: true
        });

        let msg = contextOrMsg?.msg ?? contextOrMsg ?? dummyMsg,
            replyMsg = contextOrMsg?.replyMsg ?? options.replyMsg ?? null;

        let type = null;

        switch (t_type) {
            case "script":
                type = TagTypes.defaults.scriptType;
                break;
            case "binary":
                type = "binary";
                break;
            default:
                type = TagTypes.types.validScript.has(t_type) ? t_type : null;
        }

        let body = type === null ? t_args : t_body,
            fromReply = false;

        if (Util.empty(body) && Util.empty(msg.attachments) && replyMsg !== null) {
            msg = replyMsg;
            body = msg.content ?? "";
            fromReply = true;
        }

        const hasAttachments = !Util.empty(msg.attachments);

        if (Util.empty(body) && !hasAttachments) {
            return {
                body: null,
                meta: null,
                attachment: false,
                fromReply: false,
                err: `${getEmoji("warn")} Tag body is empty.`
            };
        }

        let parsed, downloaded;

        if (hasAttachments) {
            try {
                downloaded = await getClient().tagManager.downloadBody(t_args, msg, "tag");

                parsed = {
                    ...downloaded,
                    meta: Tag.getParsedMeta(downloaded, type)
                };
            } catch (err) {
                getLogger().error(err);

                if (err.name === "TagError") {
                    return {
                        body: null,
                        meta: null,
                        attachment: false,
                        err: `${getEmoji("warn")} ${err.message}.`
                    };
                } else {
                    return {
                        body: null,
                        meta: null,
                        attachment: false,
                        err: DiscordUtil.formatErrorEmbed(`${getEmoji("error")} Downloading attachment failed:`, err, {
                            charLimit: getConfig().errorCharLimit
                        })
                    };
                }
            }
        } else {
            const parsedBody = options.allowFilePath
                ? await EmulationCommandUtil.resolveGuessedPathBody(body, {
                      name: "tag body"
                  })
                : {
                      body,
                      err: null,
                      guessedPath: false
                  };

            if (parsedBody.err !== null) {
                return {
                    body: null,
                    meta: null,
                    attachment: false,
                    err: `${getEmoji(parsedBody.err.level)} ${parsedBody.err.message}.`
                };
            }

            if (parsedBody.guessedPath) {
                parsed = {
                    body: parsedBody.body,
                    meta: Tag.getParsedMeta(parsedBody, type)
                };
            } else {
                parsed = Tag.parseTagBody(parsedBody.body, type);
            }
        }

        const attachment = hasAttachments ? !downloaded.isFile : DiscordUtil.hasAttachmentUrls(parsed.body);

        return {
            body: parsed.body,
            meta: parsed.meta,
            attachment,
            fromReply,
            err: null
        };
    }

    checkCommand(name) {
        if (this.matchesSubcmd(name)) {
            return `${getEmoji("invalid")} **${escapeMarkdown(name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        return null;
    }

    async checkOwner(tag, ctx, action) {
        if (tag === null) {
            return null;
        }

        if (tag.owner !== ctx.msg.author.id && !getClient().permManager.allowed(ctx.perm, "mod")) {
            const owner = await tag.getOwner();
            return `${getEmoji("warn")} You can only ${action} your own tags.${owner === "not found" ? " Tag owner not found." : ` The tag is owned by \`${owner}\`.`}`;
        }

        return null;
    }

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getSubcmdHelp()} **tag_name** \`[tag_args]\``;
        }

        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("tagArgs"),
            debug = false;

        if (getClient().tagVM?.enableUserInspector && t_name === "debug") {
            debug = true;
            [t_name, t_args] = PositionalCommandReader.split(t_args, {
                lowercase: true
            });

            if (Util.empty(t_name)) {
                return `${getEmoji("info")} ${this.getSubcmdHelp()} **debug** \`tag_name [tag_args]\``;
            }
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            let out = `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`,
                { results: find } = await getClient().tagManager.search(t_name, 5, 0.3);

            if (!Util.empty(find)) {
                const names = `**${find.join("**, **")}**`;
                out += `\nDid you mean: ${names}?`;
            }

            return out;
        }

        if (tag.isAlias) {
            try {
                tag = await getClient().tagManager.fetchAlias(tag);
            } catch (err) {
                return this.formatError(err, tag);
            }
        }

        let errored = false,
            out;

        try {
            out = await getClient().tagManager.execute(
                tag,
                t_args,
                {
                    msg: ctx.msg
                },
                {
                    commandContext: ctx,
                    enableInspector: debug,
                    inspectorSourceUrl: `file:///tags/${tag.name}.js`,
                    inspectorTitle: `tag inspector [${tag.name}]`,
                    onInspectorReady: debug ? async info => await ctx.reply(getInspectorAttachOutput(info)) : undefined
                }
            );
        } catch (err) {
            errored = true;
            out = this.formatError(err, tag);
        }

        if (errored && !debug) {
            return out;
        }

        const replyOut = await this.formatReply(out, ctx.msg);

        if (!debug) {
            return replyOut;
        }

        const [editOut, editOptions] = getReplyData(replyOut);
        await ctx.edit(editOut, editOptions);
    }

    formatTagType(tag) {
        if (tag.isBinary) {
            return "binary tag";
        } else if (tag.isScript) {
            return "script tag";
        } else {
            return "tag";
        }
    }

    formatError(err, tag) {
        switch (err.name) {
            case "TagError":
                switch (err.message) {
                    case "Tag recursion detected":
                        return `${getEmoji("warn")} Epic recursion fail: **${err.ref.map(name => escapeMarkdown(name)).join("** -> **")}**`;
                    case "Hop not found":
                        return `${getEmoji("warn")} Tag **${escapeMarkdown(err.ref)}** doesn't exist.`;
                    default:
                        return `${getEmoji("warn")} ${err.message}.`;
                }
            case "ClientError":
                return `${getEmoji("error")} Can't execute script tag. ${err.message}.`;
            default:
                const tagName = TypeTester.isObject(tag) ? tag.name : tag,
                    header = Util.nonemptyString(tagName)
                        ? `${getEmoji("error")} Encountered exception while executing tag **${escapeMarkdown(tagName)}**:`
                        : `${getEmoji("error")} Encountered exception while executing tag:`;

                return DiscordUtil.formatErrorEmbed(header, err, {
                    charLimit: getConfig().errorCharLimit
                });
        }
    }

    async getPreview(out, msg) {
        let preview = null;

        try {
            preview = await getClient().previewHandler.generatePreview(msg, out);
        } catch (err) {
            getLogger().error("Preview gen failed:", err);
        }

        if (preview === null) {
            return out;
        }

        const previewMsg = { embeds: [preview] },
            cleanOut = getClient().previewHandler.removeLink(out);

        if (!Util.empty(cleanOut)) {
            previewMsg.content = cleanOut;
        }

        return previewMsg;
    }

    async formatReply(out, msg) {
        if (getClient().previewHandler?.canPreview(out)) {
            return [
                await this.getPreview(out, msg),
                {
                    type: "options",
                    limitType: MessageLimitTypes.none
                }
            ];
        }

        return [
            out,
            {
                type: "options",
                useConfigLimits: true
            }
        ];
    }
}

export default TagCommand;
