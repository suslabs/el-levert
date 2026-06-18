import { escapeMarkdown } from "discord.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";
import { MessageLimitTypes } from "../../handlers/discord/MessageLimitTypes.js";

import { resolveVMLanguage } from "../../structures/vm/VMLanguages.js";

import { getClient, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

const dummyMsg = {
    attachments: new Map()
};

function getParsedMeta(parsed, type) {
    if (!parsed.isScript) {
        return {};
    }

    return {
        type: type ?? TagTypes.defaults.scriptType,
        language: resolveVMLanguage(parsed.lang, TagTypes.defaults.language)
    };
}

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

class TagCommand {
    static info = {
        name: "tag",
        aliases: ["t"],
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: true
            },
            {
                name: "tagArgs",
                parser: "split",
                index: 1
            }
        ],
        subcommands: [
            "add",
            "alias",
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
            "rename",
            "search",
            "set_type"
        ]
    };

    async parseBase(t_args, msg) {
        const [t_type, t_body] = ParserUtil.splitArgs(t_args, true);
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
                err: `${getEmoji("warn")} Tag body is empty.`
            };
        }

        let parsed;

        if (hasAttachments) {
            try {
                const downloaded = await getClient().tagManager.downloadBody(t_args, msg, "tag");

                parsed = {
                    ...downloaded,
                    meta: getParsedMeta(downloaded, type)
                };
            } catch (err) {
                getLogger().error(err);

                return err.name === "TagError"
                    ? {
                          body: null,
                          meta: null,
                          err: `${getEmoji("warn")} ${err.message}.`
                      }
                    : {
                          body: null,
                          meta: null,
                          err: {
                              content: `${getEmoji("error")} Downloading attachment failed:`,
                              ...DiscordUtil.getFileAttach(err.stack, "error.js")
                          }
                      };
            }
        } else {
            parsed = ParserUtil.parseScript(body);
            parsed.meta = getParsedMeta(parsed, type);
        }

        return {
            body: parsed.body,
            meta: parsed.meta,
            err: null
        };
    }

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getSubcmdHelp()} **tag_name** \`[tag_args]\``;
        }

        let t_name = ctx.arg("tagName"),
            t_args = ctx.arg("tagArgs");

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

        let out;

        try {
            out = await getClient().tagManager.execute(
                tag,
                t_args,
                {
                    msg: ctx.msg
                },
                {
                    commandContext: ctx
                }
            );
        } catch (err) {
            switch (err.name) {
                case "TagError":
                    return `${getEmoji("warn")} ${err.message}.`;
                case "ClientError":
                    return `${getEmoji("error")} Can't execute script tag. ${err.message}.`;
                default:
                    throw err;
            }
        }

        return getClient().previewHandler.canPreview(out)
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
    }
}

export default TagCommand;
