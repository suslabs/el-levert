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
    formatReply: (text, options) => {
        let out = {};

        if (typeof text === "object") {
            options = text;
        } else {
            out.content = text ?? "";
        }

        if (typeof options !== "undefined") {
            if (typeof options.embed !== "undefined") {
                const embed = options.embed;
                embed.description = embed.description ?? "";

                out.embeds = [embed];
            }

            if (typeof options.file !== "undefined") {
                out.file = options.file;
            }
        }

        return out;
    },
    sockWrite: (socket, packetType, obj) => {
        obj.packetType = packetType ?? "unknown";

        socket.write(JSON.stringify(obj) + "\n");
    }
};

export default VMUtil;
