import repl from "node:repl";
import { PassThrough } from "node:stream";

import Util from "../Util.js";
import VMUtil from "../vm/VMUtil.js";

const emptyCommand = {
    help: "",
    action: () => {}
};

const builtinCommands = ["help", "break", "clear", "editor", "help", "load", "save"];

function replEval(code, context = {}) {
    code = code.replace(/^\s*\.(?=\w)/gm, "//.");

    const input = new PassThrough(),
        output = new PassThrough();

    const results = [];

    const server = repl.start({
        input,
        output,

        prompt: "",
        useGlobal: true,
        ignoreUndefined: true,
        terminal: false,

        writer: output => {
            if (typeof output !== "undefined") {
                results.push(output);
            }

            return "";
        }
    });

    for (const command of builtinCommands) {
        server.defineCommand(command, emptyCommand);
    }

    Object.assign(server.context, context);

    return new Promise((resolve, reject) => {
        server.on("exit", () => {
            const final = Util.last(results);

            if (final instanceof Error) {
                VMUtil.rewriteReplStackTrace(final);
                reject(final);
            } else {
                resolve(final);
            }
        });

        server.once("error", err => {
            server.close();
            reject(err);
        });

        input.end(`${code}\n.exit\n`);
    });
}

export default replEval;
