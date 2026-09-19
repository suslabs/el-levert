import { ScriptCommandType } from "../../parsers/command/type/index.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import EmulationCommandUtil from "../../util/commands/EmulationCommandUtil.js";
import getInspectorAttachOutput from "../../util/vm/getInspectorAttachOutput.js";

function formatPathError(err) {
    return `${getEmoji(err.level)} ${err.message}.`;
}

async function evalBase(args, msg, options) {
    options = ObjectUtil.guaranteeObject(options);

    let body = "";

    if (Util.empty(msg.attachments)) {
        const parsedBody = options.allowFilePath
            ? await EmulationCommandUtil.resolveGuessedPathBody(args, {
                  name: "script"
              })
            : {
                  body: args,
                  err: null
              };

        if (parsedBody.err !== null) {
            return {
                body: null,
                err: formatPathError(parsedBody.err)
            };
        }

        ({ body } = ScriptCommandType.parse(parsedBody.body));
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

async function altevalBase(args, msg, lang, options) {
    const parsed = await evalBase(args, msg, options),
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
        description: "Evaluate code using one of the configured languages.",
        aliases: ["e", "exec"],
        subcommands: ["c", "cpp", "py", "vm2", "langs"],
        arguments: [
            {
                name: "debug",
                kind: "option",
                type: "boolean",
                syntax: "both"
            },
            {
                name: "script",
                kind: "rest"
            }
        ]
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

    async evalBase(args, msg, options) {
        return await evalBase(args, msg, options);
    }

    async altevalBase(args, msg, lang, options) {
        return await altevalBase(args, msg, lang, options);
    }

    canUseFilePath(ctx) {
        return getClient().permManager.allowed(ctx.perm, "admin");
    }

    async handler(ctx) {
        const debug = (ctx.arg("debug") ?? false) && (getClient().tagVM?.enableUserInspector ?? false),
            argsText = ctx.arg("script") ?? "";

        const parsed = await this.evalBase(argsText, ctx.msg, {
                allowFilePath: this.canUseFilePath(ctx)
            }),
            body = parsed.body;

        if (parsed.err !== null) {
            return parsed.err;
        }

        let out = null;

        try {
            if (debug) {
                out = await getClient().tagVM.runScript(
                    body,
                    {
                        msg: ctx.msg
                    },
                    {
                        commandContext: ctx,
                        enableInspector: true,
                        inspectorSourceUrl: "file:///eval.js",
                        inspectorTitle: `eval inspector [${ctx.msg.author.id}]`,
                        onInspectorReady: async info => await ctx.reply(getInspectorAttachOutput(info))
                    }
                );

                await ctx.edit(out, {
                    useConfigLimits: true
                });

                return;
            }

            out = await getClient().tagVM.runScript(body, { msg: ctx.msg }, { commandContext: ctx });
        } catch (err) {
            if (err.name !== "VMError") {
                throw err;
            }

            out = `${getEmoji("error")} ${err.message}.`;

            if (debug) {
                await ctx.edit(out, {
                    useConfigLimits: true
                });

                return;
            }
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
