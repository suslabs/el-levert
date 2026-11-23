import { Buffer } from "node:buffer";

import UtilError from "../../errors/UtilError.js";

const StreamUtil = Object.freeze({
    read: async (stream, maxSize = Infinity) => {
        const chunks = [];
        let size = 0;

        try {
            for await (const chunk of stream) {
                const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += data.length;

                if (size > maxSize) {
                    throw new UtilError("Stream exceeds maximum size");
                }

                chunks.push(data);
            }

            return Buffer.concat(chunks, size);
        } finally {
            stream.destroy();
        }
    }
});

export default StreamUtil;
