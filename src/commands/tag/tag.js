import { escapeMarkdown } from "discord.js";

import { MessageLimitTypes } from "../../handlers/discord/MessageLimitTypes.js";

import Tag from "../../structures/tag/Tag.js";
import { TagTypes } from "../../structures/tag/TagTypes.js";

import { getClient, getEmoji, getLogger } from "../../LevertClient.js";

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

const tagAttachmentWarning =
    "**Heads-up! Discord-hosted images disappear if the original message that provided them is deleted.**";

async function getPreview(out, msg) {
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
        description: "Create, manage, and execute tags.",
        aliases: ["t"],
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
            "audit",
            "chown",
            "count",
            "delete",
            "dump",
            "edit",
            "fullsearch",
            "info",
            "leaderboard",
            "list",
            "owner",
            "quota",
            "random",
            "raw",
            "revert",
            "rename",
            "search",
            "set_type"
        ]
    };

    attachmentWarning = tagAttachmentWarning;

    async parseBase(t_args, msg, options) {
        options = ObjectUtil.guaranteeObject(options);

        const [t_type, t_body] = PositionalCommandReader.split(t_args, {
            lowercase: true
        });
        msg ??= dummyMsg;

        let type = null;

        switch (t_type) {
            case "script":
                type = TagTypes.defaults.scriptType;
                break;
            default:
                type = TagTypes.types.validScript.has(t_type) ? t_type : null;
        }

        const body = type === null ? t_args : t_body,
            hasAttachments = !Util.empty(msg.attachments);

        if (Util.empty(t_args) && !hasAttachments) {
            return {
                body: null,
                meta: null,
                attachment: false,
                err: `${getEmoji("warn")} Tag body is empty.`
            };
        }

        let parsed;

        if (hasAttachments) {
            try {
                const downloaded = await getClient().tagManager.downloadBody(t_args, msg, "tag");

                parsed = {
                    ...downloaded,
                    meta: Tag.getParsedMeta(downloaded, type)
                };
            } catch (err) {
                getLogger().error(err);

                return err.name === "TagError"
                    ? {
                          body: null,
                          meta: null,
                          attachment: false,
                          err: `${getEmoji("warn")} ${err.message}.`
                      }
                    : {
                          body: null,
                          meta: null,
                          attachment: false,
                          err: {
                              content: `${getEmoji("error")} Downloading attachment failed:`,
                              ...DiscordUtil.getFileAttach(err.stack, "error.js")
                          }
                      };
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

            parsed = parsedBody.guessedPath
                ? {
                      body: parsedBody.body,
                      meta: Tag.getParsedMeta(parsedBody, type)
                  }
                : Tag.parseTagBody(parsedBody.body, type);
        }

        const attachment = hasAttachments || !Util.empty(DiscordUtil.findAttachmentUrls(parsed.body));

        return {
            body: parsed.body,
            meta: parsed.meta,
            attachment,
            err: null
        };
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
                tag = await getClient().tagManager.fetchAlias(tag, true);
            } catch (err) {
                if (err.name !== "TagError") {
                    throw err;
                }

                switch (err.message) {
                    case "Tag recursion detected":
                        return `${getEmoji("warn")} Epic recursion fail: **${err.ref.map(name => escapeMarkdown(name)).join("** -> **")}**`;
                    case "Hop not found":
                        return `${getEmoji("warn")} Tag **${err.ref}** doesn't exist.`;
                    default:
                        return `${getEmoji("warn")} ${err.message}.`;
                }
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
            switch (err.name) {
                case "TagError":
                    errored = true;
                    out = `${getEmoji("warn")} ${err.message}.`;
                    break;
                case "ClientError":
                    errored = true;
                    out = `${getEmoji("error")} Can't execute script tag. ${err.message}.`;
                    break;
                default:
                    throw err;
            }
        }

        if (errored && !debug) {
            return out;
        }

        const replyOut = getClient().previewHandler.canPreview(out)
            ? [
                  await getPreview(out, ctx.msg),
                  {
                      type: "options",
                      limitType: MessageLimitTypes.none
                  }
              ]
            : [
                  out,
                  {
                      type: "options",
                      useConfigLimits: true
                  }
              ];

        if (!debug) {
            return replyOut;
        }

        const [editOut, editOptions] = getReplyData(replyOut);
        await ctx.edit(editOut, editOptions);
    }
}

export default TagCommand;
