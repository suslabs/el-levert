import TypeTester from "../TypeTester.js";

import UtilError from "../../errors/UtilError.js";

const VMUtil = {
    resolveObject(path, propertyMap) {
        if (typeof path !== "string") {
            throw new UtilError("Invalid path provided");
        }

        if (typeof propertyMap === "undefined") {
            throw new UtilError("Can't resolve object, no property map provided");
        }

        return path.split(".").reduce(({ obj }, key) => {
            const next = obj?.[key] ?? propertyMap.get(key);

            if (typeof next === "undefined") {
                throw new UtilError(`Property not found: ${key}`, key);
            }

            return { parent: obj, obj: next };
        }, {});
    },

    removeCircularReferences: obj => {
        const pathMap = new Map();

        const recRemove = (val, path) => {
            if (!TypeTester.isObject(val)) {
                return val;
            }

            const seenPath = pathMap.get(val);

            if (seenPath) {
                const joinedPath = seenPath.join(".");
                return `[Circular reference${joinedPath.length < 1 ? "" : `: ${joinedPath}`}]`;
            }

            pathMap.set(val, path);
            const newVal = Array.isArray(val) ? [] : {};

            for (const [key, value] of Object.entries(val)) {
                newVal[key] = recRemove(value, path.concat(key));
            }

            pathMap.delete(val);
            return newVal;
        };

        return recRemove(obj, []);
    },

    formatOutput: out => {
        if (out == null) {
            return out;
        } else if (Array.isArray(out)) {
            return out.join(", ");
        }

        switch (typeof out) {
            case "bigint":
            case "boolean":
            case "number":
                return out.toString(10);
            case "string":
                return out;
            case "function":
            case "symbol":
                return null;
            case "object":
                try {
                    return JSON.stringify(out);
                } catch (err) {
                    return null;
                }
        }
    },

    _allowedEmbedProps: [
        "author",
        "color",
        "description",
        "fields",
        "footer",
        "hexColor",
        "image",
        "thumbnail",
        "timestamp",
        "title",
        "url"
    ],

    formatReply: (text, msg) => {
        let out = {};

        if (TypeTester.isObject(text)) {
            msg = text;
        } else {
            out.content = VMUtil.formatOutput(text) ?? "";
        }

        if (msg == null) {
            return out;
        } else if (typeof msg.content !== "undefined") {
            out.content = VMUtil.formatOutput(msg.content);
        }

        if (TypeTester.isObject(msg.embed)) {
            const embed = {};

            for (const prop of VMUtil._allowedEmbedProps) {
                if (prop in msg.embed) {
                    embed[prop] = msg.embed[prop];
                }
            }

            embed.description ??= "";
            out.embeds = [embed];
        }

        if (TypeTester.isObject(msg.file)) {
            out.file = msg.file;
        }

        return out;
    },

    initialBreakpoint: "/* break on script start */ debugger;",
    strictRegex: /^\s*(['"])use strict\1;?/,

    addDebuggerStmt: code => {
        if (VMUtil.strictRegex.test(code)) {
            return code.replace(VMUtil.strictRegex, match => `${match}\n${VMUtil.initialBreakpoint}\n`);
        } else {
            return `${VMUtil.initialBreakpoint}\n\n${code}`;
        }
    },

    indentation: 4,

    rewriteStackTrace: (err, cb) => {
        if (typeof err.stack !== "string") {
            return;
        }

        let stackFrames = err.stack.split("\n"),
            msgLine;

        [msgLine, ...stackFrames] = stackFrames;
        stackFrames = stackFrames.map(frame => frame.trim());

        const res = cb(msgLine, stackFrames) ?? true;

        if (Array.isArray(res)) {
            [msgLine, stackFrames] = res;
        } else if (!res) {
            return;
        }

        const formattedFrames = stackFrames.map(frame => VMUtil._spaces + frame),
            newStack = msgLine + "\n" + formattedFrames.join("\n");

        delete err.stack;
        err.stack = newStack;
    },

    _boundary: "(<isolated-vm boundary>)",
    rewriteIVMStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const boundaryLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._boundary));
            return boundaryLine >= 0 ? [msgLine, stackFrames.slice(0, boundaryLine + 1)] : false;
        });
    },

    _repl: "REPL",
    rewriteReplStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const replLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._repl));
            return replLine >= 0 ? [msgLine, stackFrames.slice(0, replLine + 1)] : false;
        });
    },

    sockWrite: (socket, packetType, obj) => {
        obj.packetType = packetType ?? "unknown";
        socket.write(JSON.stringify(obj) + "\n");
    }
};

{
    VMUtil._spaces = " ".repeat(VMUtil.indentation);
}

export default VMUtil;
