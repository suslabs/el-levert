const VMUtil = {
    removeCircRef: obj => {
        const pathMap = new Map();

        function recRemove(val, path) {
            if (val === null || typeof val !== "object") {
                return val;
            }

            const seenPath = pathMap.get(val);

            if (seenPath) {
                const joinedPath = seenPath.join(".");

                if (joinedPath.length < 1) {
                    return "[Circular reference]";
                } else {
                    return `[Circular reference: ${joinedPath}]`;
                }
            }

            pathMap.set(val, path);

            const newVal = Array.isArray(val) ? [] : {};

            for (const [key, value] of Object.entries(val)) {
                newVal[key] = recRemove(value, path.concat(key));
            }

            pathMap.delete(val);

            return newVal;
        }

        return recRemove(obj, []);
    },

    formatOutput: out => {
        if (out === null) {
            return undefined;
        }

        if (Array.isArray(out)) {
            return out.join(", ");
        }

        switch (typeof out) {
            case "bigint":
            case "boolean":
            case "number":
                return out.toString(10);
            case "function":
            case "symbol":
                return undefined;
            case "object":
                try {
                    return JSON.stringify(out);
                } catch (err) {
                    return undefined;
                }
            default:
                return out;
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
        "timestamp",
        "title",
        "url"
    ],
    formatReply: (text, msg) => {
        let out = {};

        if (typeof text === "object") {
            msg = text;
        } else {
            out.content = VMUtil.formatOutput(text) ?? "";
        }

        if (msg === null || typeof msg === "undefined") {
            return out;
        }

        if (typeof msg.content !== "undefined") {
            out.content = VMUtil.formatOutput(msg.content);
        }

        if (msg.embed !== null && typeof msg.embed === "object") {
            const embed = {};

            for (const prop of VMUtil._allowedEmbedProps) {
                if (prop in msg.embed) {
                    embed[prop] = msg.embed[prop];
                }
            }

            embed.description ??= "";
            out.embeds = [embed];
        }

        if (msg.file !== null && typeof msg.file === "object") {
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
    boundary: "(<isolated-vm boundary>)",

    rewriteIVMStackTrace: err => {
        let stackFrames = err.stack.split("\n"),
            msgLine;

        [msgLine, ...stackFrames] = stackFrames;
        stackFrames = stackFrames.map(frame => frame.trim());

        const boundaryLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil.boundary));

        if (boundaryLine === -1) {
            return err.stack;
        }

        stackFrames = stackFrames.slice(0, boundaryLine);

        const spaces = " ".repeat(VMUtil.indentation),
            formattedFrames = stackFrames.map(frame => spaces + frame);

        return msgLine + "\n" + formattedFrames.join("\n");
    },

    sockWrite: (socket, packetType, obj) => {
        obj.packetType = packetType ?? "unknown";
        socket.write(JSON.stringify(obj) + "\n");
    }
};

export default VMUtil;
