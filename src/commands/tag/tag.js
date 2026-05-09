import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import MessageLimitTypes from "../../handlers/discord/MessageLimitTypes.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";

const dummyMsg = {
    attachments: new Map()
};

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

        if (msg == null) {
            msg = dummyMsg;
        }

        const hasAttachments = !Util.empty(msg.attachments);

        if (Util.empty(t_args) && !hasAttachments) {
            return {
                body: null,
                type: null,
                err: `${getEmoji("warn")} Tag body is empty.`
            };
        }

        let body, isScript;

        if (hasAttachments) {
            try {
                ({ body, isScript } = await getClient().tagManager.downloadBody(t_args, msg, "tag"));
            } catch (err) {
                getLogger().error(err);

                return err.name === "TagError"
                    ? {
                          body: null,
                          type: null,
                          err: `${getEmoji("warn")} ${err.message}.`
                      }
                    : {
                          body: null,
                          type: null,
                          err: {
                              content: `${getEmoji("error")} Downloading attachment failed:`,
                              ...DiscordUtil.getFileAttach(err.stack, "error.js")
                          }
                      };
            }
        } else {
            let tagBody = t_args;

            if (TagTypes.scriptTypes.includes(t_type)) {
                tagBody = t_body;
            }

            ({ body, isScript } = ParserUtil.parseScript(tagBody));
        }

        let type = null;

        if (isScript) {
            type = TagTypes.scriptTypes.includes(t_type) ? t_type : TagTypes.defaultScriptType;
        } else {
            type = TagTypes.textType;
        }

        return { body, type, err: null };
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
            out = await getClient().tagManager.execute(tag, t_args, { msg: ctx.msg });
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
