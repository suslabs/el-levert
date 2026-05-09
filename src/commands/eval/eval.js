import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import ArrayUtil from "../../util/ArrayUtil.js";
import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

async function evalBase(args, msg) {
    let body = "";

    if (Util.empty(msg.attachments)) {
        ({ body } = ParserUtil.parseScript(args));
    } else {
        try {
            ({ body } = await getClient().tagManager.downloadBody(null, msg, "eval"));
        } catch (err) {
            return err.name === "TagError"
                ? {
                      body: null,
                      err: `${getEmoji("warn")} ${err.message}.`
                  }
                : {
                      body: null,
                      err: {
                          content: `${getEmoji("error")} Downloading attachment failed:`,
                          ...DiscordUtil.getFileAttach(err.stack, "error.js")
                      }
                  };
        }
    }

    return Util.empty(body)
        ? {
              body: null,
              err: `${getEmoji("error")} Can't eval an empty script.`
          }
        : { body, err: null };
}

async function altevalBase(args, msg, lang) {
    const parsed = await evalBase(args, msg),
        body = parsed.body;

    if (parsed.err !== null) {
        return parsed.err;
    }

    let evalOut, resCode;

    try {
        [evalOut, resCode] = await getClient().externalVM.runScript(body, lang);
    } catch (err) {
        if (err.name !== "ExternalVMError") {
            throw err;
        }

        let parsedJson = {};

        try {
            parsedJson = JSON.parse(err.message);
        } catch (parseErr) {
            return `${getEmoji("error")} ${Util.capitalize(parseErr.message)}.`;
        }

        const format = Object.values(parsedJson)
            .map(errorEntry => ArrayUtil.guaranteeArray(errorEntry).map(Util.capitalize).join(", "))
            .join("\n");

        return `${getEmoji("error")} ${format}.`;
    }

    switch (resCode) {
        case 3:
            break;
        case 6:
            return {
                content: `${getEmoji("error")} Script compilation failed:`,
                ...DiscordUtil.getFileAttach(evalOut.compileOutput, "compile_error.js")
            };
        default:
            return `${getEmoji("error")} ${getClient().externalVM.codes[resCode]}.`;
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

class EvalCommand {
    static info = {
        name: "eval",
        aliases: ["e", "exec"],
        subcommands: ["c", "cpp", "py", "vm2", "langs"]
    };

    load() {
        if (!getConfig().enableEval) {
            return false;
        }

        this.langNames = { ...langNames };
        this.subcommands.length = 0;
        this.subcommands.push("langs");

        if (getConfig().enableOtherLangs) {
            this.subcommands.push("c", "cpp", "py");
            Object.assign(this.langNames, altLangNames);
        }

        if (getConfig().enableVM2) {
            this.subcommands.push("vm2");
        }
    }

    async evalBase(args, msg) {
        return await evalBase(args, msg);
    }

    async altevalBase(args, msg, lang) {
        return await altevalBase(args, msg, lang);
    }

    async handler(ctx) {
        const parsed = await this.evalBase(ctx.argsText, ctx.msg),
            body = parsed.body;

        if (parsed.err !== null) {
            return parsed.err;
        }

        let out = null;

        try {
            out = await getClient().tagVM.runScript(body, { msg: ctx.msg });
        } catch (err) {
            if (err.name !== "VMError") {
                throw err;
            }

            out = `${getEmoji("error")} ${err.message}.`;
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

export default EvalCommand;
