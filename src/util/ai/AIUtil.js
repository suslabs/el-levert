import Util from "../Util.js";
import ObjectUtil from "../ObjectUtil.js";
import ArrayUtil from "../ArrayUtil.js";

const AIUtil = Object.freeze({
    getText: parts => {
        return parts
            .filter(part => typeof part.text === "string" && !part.thought)
            .map(part => part.text)
            .join("");
    },

    getCalls: parts => {
        return parts
            .filter(part => typeof part.functionCall !== "undefined")
            .map(part => ({ ...part.functionCall, args: ObjectUtil.guaranteeObject(part.functionCall.args) }));
    },

    createResponse: (call, res) => {
        const functionResponse = { name: call.name, response: res };

        if (typeof call.id !== "undefined") {
            functionResponse.id = call.id;
        }

        return { functionResponse };
    },

    parseJson: (text, fallback) => {
        try {
            return JSON.parse(text);
        } catch {
            return fallback;
        }
    },

    pageChars: Object.freeze({
        default: 5000,
        min: 500,
        max: 8000
    }),

    pageText: (text, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const offset = Math.max(options.offset ?? 0, 0),
            maxChars = Util.clamp(
                options.maxChars ?? AIUtil.pageChars.default,
                AIUtil.pageChars.min,
                AIUtil.pageChars.max
            );

        const end = offset + maxChars;

        return {
            text: text.slice(offset, end),
            offset,
            nextOffset: end < text.length ? end : null,
            totalChars: text.length
        };
    },

    formatDuration: ms => {
        return Util.duration(ms, { format: true, short: true, largestOnly: true });
    },

    formatElapsed: startTime => {
        return `${Util.formatNumber(Util.timeDelta(Date.now(), startTime))} ms`;
    },

    cleanList: list => {
        const items = ArrayUtil.guaranteeArray(list, null, true).map(item => String(item).trim());
        return ArrayUtil.unique(items.filter(Util.nonemptyString));
    },

    _endPunctuationRegex: /[.?!]$/,
    formatQuestion: text => {
        const question = Util.capitalize(text);
        return AIUtil._endPunctuationRegex.test(question) ? question : `${question}?`;
    },

    formatList: (header, items) => {
        if (Util.empty(items)) {
            return "";
        }

        return [header, ...items.map((item, i) => `${i + 1}. ${item}`)].join("\n");
    },

    joinSections: (...sections) => {
        return sections.filter(Util.nonemptyString).join("\n\n");
    }
});

export default AIUtil;
