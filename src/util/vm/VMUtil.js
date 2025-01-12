const initialBreakpoint = "/* break on script start */ debugger;",
    strictRegex = /^\s*(['"])use strict\1;?/;

const indent = " ".repeat(4),
    boundary = "(<isolated-vm boundary>)";

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

        if (typeof msg.embed !== "undefined") {
            const embed = msg.embed;
            embed.description ??= "";

            out.embeds = [embed];
        }

        if (typeof msg.file !== "undefined") {
            out.file = msg.file;
        }

        return out;
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

    sockWrite: (socket, packetType, obj) => {
        obj.packetType = packetType ?? "unknown";
        socket.write(JSON.stringify(obj) + "\n");
    },

    addDebuggerStmt: code => {
        if (strictRegex.test(code)) {
            return code.replace(strictRegex, match => `${match}\n${initialBreakpoint}\n`);
        } else {
            return `${initialBreakpoint}\n\n${code}`;
        }
    },

    rewriteIVMStackTrace: err => {
        let stackFrames = err.stack.split("\n"),
            msgLine;

        [msgLine, ...stackFrames] = stackFrames;
        stackFrames = stackFrames.map(frame => frame.trim());

        const boundaryLine = stackFrames.findIndex(frame => frame.startsWith("at " + boundary));

        if (boundaryLine === -1) {
            return err.stack;
        }

        stackFrames = stackFrames.slice(0, boundaryLine);

        const formattedFrames = stackFrames.map(frame => indent + frame);
        return msgLine + "\n" + formattedFrames.join("\n");
    }
};

export default VMUtil;
