import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

async function evalBase(args, msg) {
    let body;

    if (!Util.empty(msg.attachments)) {
        try {
            [body] = await getClient().tagManager.downloadBody(null, msg);
        } catch (err) {
            if (err.name === "TagError") {
                return {
                    body: null,
                    err: `:warning: ${err.message}.`
                };
            }

            return {
                body: null,
                err: {
                    content: ":no_entry_sign: Downloading attachment failed:",
                    ...DiscordUtil.getFileAttach(err.stack, "error.js")
                }
            };
        }
    } else {
        [, body] = DiscordUtil.parseScript(args);
    }

    if (Util.empty(body)) {
        return {
            err: ":no_entry_sign: Can't eval an empty script."
        };
    }

    return { body, err: null };
}

async function altevalBase(args, msg, lang) {
    const base = this.evalBase ?? this.parentCmd.evalBase,
        parsed = await base(args, msg),
        body = parsed.body;

    if (parsed.err !== null) {
        return parsed.err;
    }

    let evalOut, resCode;

    try {
        [evalOut, resCode] = await getClient().externalVM.runScript(body, lang);
    } catch (err) {
        if (err.name === "ExternalVMError") {
            let parsed;

            try {
                parsed = JSON.parse(err.message);
            } catch (err) {
                return `:no_entry_sign: ${Util.capitalize(err.message)}.`;
            }

            const format = Object.values(parsed)
                .map(err => Util.capitalize(err).join(","))
                .join("\n");

            return `:no_entry_sign: ${format}.`;
        }

        throw err;
    }

    switch (resCode) {
        case 3:
            break;
        case 6:
            return {
                content: ":no_entry_sign: Script compilation failed:",
                ...DiscordUtil.getFileAttach(evalOut.compileOutput, "compile_error.js")
            };
        default:
            return `:no_entry_sign: ${getClient().externalVM.codes[resCode]}.`;
    }

    let out = "";

    if (!Util.empty(evalOut.stdout)) {
        out += `\n${evalOut.stdout}`;
    }

    if (!Util.empty(evalOut.stderr)) {
        if (!Util.empty(out)) {
            out += "\n\n";
        }

        out += `stderr:\n${evalOut.stderr}`;
    }

    return out;
}

const langNames = {
    js: "By default"
};

const altLangNames = {
    c: "THE C PROGRAMMING LANGUAGE",
    cpp: "C++ is a high-level programming language created by George Orwell",
    py: ":snake:"
};

export default {
    name: "eval",
    aliases: ["e", "exec"],
    subcommands: ["c", "cpp", "py", "vm2", "langs"],

    load: function () {
        if (!getClient().config.enableEval) {
            return false;
        }

        this.evalBase = evalBase.bind(this);
        this.langNames = langNames;

        if (!getClient().config.enableOtherLangs) {
            return;
        }

        this.altevalBase = altevalBase.bind(this);
        Object.assign(this.langNames, altLangNames);
    },

    handler: async function (args, msg) {
        const parsed = await this.evalBase(args, msg),
            body = parsed.body;

        if (parsed.err !== null) {
            return parsed.err;
        }

        return await getClient().tagVM.runScript(body, { msg });
    }
};
