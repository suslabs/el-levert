import cloneDeep from "lodash.clonedeep";

export default {
    removeCircRef: obj => {
        const obj2 = cloneDeep(obj);

        function recRemove(target, obj, references) {
            for (const key in obj) {
                const val = obj[key];

                if (typeof val !== "object") {
                    let refFound = false;

                    for (const reference of references) {
                        if (reference === val) {
                            target[key] = undefined;
                            refFound = true;

                            break;
                        }
                    }

                    if (!refFound) {
                        if (val instanceof Map) {
                            const entries = Array.from(val);
                            target[key] = entries;

                            recRemove(entries, entries, [...references, entries]);
                        } else {
                            target[key] = Object.assign({}, val);

                            recRemove(target[key], val, [...references, val]);
                        }
                    }
                } else {
                    target[key] = val;
                    continue;
                }
            }

            return target;
        }

        return recRemove({}, obj2, [obj2]);
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
