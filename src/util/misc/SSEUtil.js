import Util from "../Util.js";

const SSEUtil = Object.freeze({
    dataPrefix: "data:",

    _eventSeparatorRegex: /\r?\n\r?\n/,
    _lineSeparatorRegex: /\r?\n/,

    readEvents: async function* (stream) {
        const decoder = new TextDecoder();
        let buffer = "";

        for await (const chunk of stream) {
            buffer += decoder.decode(chunk, { stream: true });

            const events = buffer.split(SSEUtil._eventSeparatorRegex);
            buffer = events.pop();

            yield* events.map(SSEUtil.parseData).filter(Util.nonemptyString);
        }

        const last = SSEUtil.parseData(buffer + decoder.decode());

        if (Util.nonemptyString(last)) {
            yield last;
        }
    },

    parseData: event => {
        return event
            .split(SSEUtil._lineSeparatorRegex)
            .filter(line => line.startsWith(SSEUtil.dataPrefix))
            .map(line => line.slice(SSEUtil.dataPrefix.length).trimStart())
            .join("\n");
    }
});

export default SSEUtil;
