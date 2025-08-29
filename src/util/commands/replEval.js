import repl from "node:repl";
import { PassThrough } from "node:stream";

import Util from "../Util.js";
import VMUtil from "../vm/VMUtil.js";

const emptyCommand = {
    help: "",
    action: () => {}
};

const builtinCommands = ["help", "break", "clear", "editor", "help", "load", "save"];

function initReplServer(sin, sout, writer) {
    const server = repl.start({
        input: sin,
        output: sout,

        prompt: "",
        useGlobal: true,
        ignoreUndefined: true,
        terminal: false,

        writer
    });

    for (const command of builtinCommands) {
        server.defineCommand(command, emptyCommand);
    }

    return server;
}

function replEval(code, context = {}) {
    code = code.replace(/^\s*\.(?=\w)/gm, "//.");

    const input = new PassThrough(),
        output = new PassThrough();

    const results = [],
        writer = output => {
            if (typeof output !== "undefined") {
                results.push(output);
            }

            return "";
        };

    const server = initReplServer(input, output, writer);
    Object.assign(server.context, context);

    return new Promise((resolve, reject) => {
        server.on("exit", () => {
            const final = Util.last(results);

            if (final instanceof Error) {
                VMUtil.rewriteReplStackTrace(final);
                reject(final);

                return;
            }

            resolve(final);
        });

        server.once("error", err => {
            server.close();
            reject(err);
        });

        input.write(`${code}\n`);
        input.end(".exit\n");
    });
}

export default replEval;
