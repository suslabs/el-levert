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
            out.content = text ?? "";
        }

        if (typeof msg === "undefined") {
            return out;
        }

        if (typeof msg.content !== "undefined") {
            out.content = msg.content;
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

    sockWrite: (socket, packetType, obj) => {
        obj.packetType = packetType ?? "unknown";

        socket.write(JSON.stringify(obj) + "\n");
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
                return out.toString();
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
    }
};

export default VMUtil;
