import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

async function evalBase(args, msg) {
    let body = args;

    if (msg.attachments.size > 0) {
        try {
            [body] = await getClient().tagManager.downloadBody(msg);
        } catch (err) {
            if (err.name === "TagError") {
                return {
                    err: ":warning: " + err.message
                };
            }

            return {
                err: {
                    content: ":no_entry_sign: Downloading attachment failed:",
                    ...Util.getFileAttach(err.stack, "error.js")
                }
            };
        }
    } else {
        [body] = Util.formatScript(body);
    }

    if (body.length < 1) {
        return {
            err: ":no_entry_sign: Can't eval an empty script."
        };
    }

    return {
        body: body
    };
}

async function altevalBase(args, msg, lang) {
    const base = this.evalBase ?? this.parentCmd.evalBase,
        parsed = await base(args, msg),
        body = parsed.body;

    if (typeof parsed.err !== "undefined") {
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
                .map(x => Util.capitalize(x).join(","))
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
                ...Util.getFileAttach(evalOut.compileOutput, "compile_error.js")
            };
        default:
            return `:no_entry_sign: ${getClient().externalVM.codes[resCode]}.`;
    }

    let out = "";

    if (evalOut.stdout.length > 0) {
        out += `\n${evalOut.stdout}`;
    }

    if (evalOut.stderr.length > 0) {
        if (out.length > 0) {
            out += "\n\n";
        }

        out += `stderr:\n${evalOut.stderr}`;
    }

    return out;
}

const langNames = {
        js: "By default"
    },
    altLangNames = {
        c: "THE C PROGRAMMING LANGUAGE",
        cpp: "C++ is a high-level programming language created by George Orwell",
        py: ":snake:"
    };

export default {
    name: "eval",
    aliases: ["e", "exec"],
    subcommands: ["c", "cpp", "py", "vm2", "langs"],
    load: function () {
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

        if (typeof parsed.err !== "undefined") {
            return parsed.err;
        }

        return await getClient().tagVM.runScript(body, msg);
    }
};
