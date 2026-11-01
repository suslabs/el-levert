import Util from "./Util.js";
import ObjectUtil from "./ObjectUtil.js";
import TypeTester from "./TypeTester.js";

import UtilError from "../errors/UtilError.js";

let VMUtil = {
    indentation: 4,

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

    resolveObject(path, propertyMap) {
        if (!Util.nonemptyString(path)) {
            throw new UtilError("Can't resolve object, no path provided");
        } else if (!(propertyMap instanceof Map)) {
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
                return `[Circular reference${Util.empty(joinedPath) ? "" : `: ${joinedPath}`}]`;
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
            const embed = ObjectUtil.filterObject(msg.embed, key => VMUtil._allowedEmbedProps.includes(key));
            embed.description ??= "";

            out.embeds = [embed];
        }

        if (TypeTester.isObject(msg.file)) {
            out.file = msg.file;
        }

        return out;
    },

    rewriteStackTrace: (err, cb) => {
        if (typeof err.stack !== "string") {
            return;
        }

        const lines = err.stack.split("\n");

        let msgLineCount = -1;

        try {
            const errString = String(err);

            if (err.stack.startsWith(errString)) {
                msgLineCount = errString.split("\n").length;
            }
        } catch (e) {}

        if (msgLineCount === -1) {
            const firstFrameIdx = lines.findIndex(line => line.trim().startsWith("at "));
            msgLineCount = firstFrameIdx !== -1 ? firstFrameIdx : 1;
        }

        msgLineCount = Util.clamp(msgLineCount, 1, lines.length);

        let msgLine = lines.slice(0, msgLineCount).join("\n"),
            stackFrames = lines.slice(msgLineCount).map(frame => frame.trim());

        const res = cb(msgLine, stackFrames) ?? true;

        if (Array.isArray(res)) {
            [msgLine, stackFrames] = res;
        } else if (!res) {
            return;
        }

        const formattedFrames = stackFrames.map(frame => VMUtil._spaces + frame),
            newStack = Util.empty(formattedFrames) ? msgLine : msgLine + "\n" + formattedFrames.join("\n");

        try {
            delete err.stack;
            Object.defineProperty(err, "stack", {
                value: newStack,
                configurable: true,
                writable: true,
                enumerable: false
            });
        } catch (err1) {
            try {
                err.stack = newStack;
            } catch (err2) {}
        }
    },

    _replBoundary: "REPL",
    rewriteReplStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const replLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._replBoundary));
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

VMUtil = Object.freeze(VMUtil);
export default VMUtil;

