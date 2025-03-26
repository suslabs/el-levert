import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";

const dummyMsg = {
    attachments: new Map()
};

async function parseBase(t_args, msg) {
    const [t_type, t_body] = Util.splitArgs(t_args, true);

    if (msg == null) {
        msg = dummyMsg;
    }

    const hasAttachments = !Util.empty(msg.attachments);

    if (Util.empty(t_args) && !hasAttachments) {
        return {
            body: null,
            type: null,
            err: ":warning: Tag body is empty."
        };
    }

    let body, isScript;

    if (hasAttachments) {
        try {
            [body, isScript] = await getClient().tagManager.downloadBody(t_args, msg);
        } catch (err) {
            getLogger().error(err);

            if (err.name === "TagError") {
                return {
                    body: null,
                    type: null,
                    err: `:warning: ${err.message}.`
                };
            }

            return {
                body: null,
                type: null,
                err: {
                    content: ":no_entry_sign: Downloading attachment failed:",
                    ...Util.getFileAttach(err.stack, "error.js")
                }
            };
        }
    } else {
        let tagBody = t_args;

        if (TagTypes.scriptTypes.includes(t_type)) {
            tagBody = t_body;
        }

        [isScript, body] = Util.parseScript(tagBody);
    }

    let type;

    if (isScript) {
        if (TagTypes.scriptTypes.includes(t_type)) {
            type = t_type;
        } else {
            type = TagTypes.defaultScriptType;
        }
    } else {
        type = TagTypes.textType;
    }

    return { body, type, err: null };
}

async function getPreview(out, msg) {
    let preview;

    try {
        preview = await getClient().previewHandler.genPreview(msg, out);
    } catch (err) {
        getLogger().error("Preview gen failed:", err);
    }

    if (typeof preview === "undefined") {
        return out;
    }

    const previewMsg = {
            embeds: [preview]
        },
        cleanOut = getClient().previewHandler.removeLink(out);

    if (!Util.empty(cleanOut)) {
        previewMsg.content = cleanOut;
    }

    return previewMsg;
}

export default {
    name: "tag",
    aliases: ["t"],
    subcommands: [
        "add",
        "alias",
        "chown",
        "count",
        "delete",
        "dump",
        "edit",
        "info",
        "leaderboard",
        "list",
        "owner",
        "quota",
        "raw",
        "rename",
        "search",
        "set_type"
    ],

    load: function () {
        this.parseBase = parseBase.bind(this);
    },

    handler: async function (args, msg, perm) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getSubcmdHelp()} **tag_name** \`[tag_args]\``;
        }

        const [t_name, t_args] = Util.splitArgs(args, true);

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return ":warning: " + err;
        }

        let tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            let out = `:warning: Tag **${t_name}** doesn't exist.`,
                find = await getClient().tagManager.search(t_name, 5);

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
                if (err.name === "TagError") {
                    switch (err.message) {
                        case "Tag recursion detected":
                            return `:warning: Epic recursion fail: **${err.ref.join("** -> **")}**`;
                        case "Hop not found":
                            return `:warning: Tag **${err.ref}** doesn't exist.`;
                    }
                }

                throw err;
            }
        }

        let out;

        try {
            out = await getClient().tagManager.execute(tag, t_args, msg);
        } catch (err) {
            if (err.name === "TagError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        if (getClient().previewHandler.canPreview(out)) {
            return await getPreview(out, msg);
        } else {
            return out;
        }
    }
};
