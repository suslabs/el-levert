import Util from "./Util.js";
import TypeTester from "./TypeTester.js";
import ObjectUtil from "./ObjectUtil.js";

const LoggerUtil = Object.freeze({
    _quotesExp: /^(["'`])[\s\S]*\1$/,

    formatBinary(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        const byteLimit = options.byteLimit ?? 256,
            allowArray = options.allowArray ?? false;

        let size = 0,
            type = null,
            bytes = null;

        if (Buffer.isBuffer(data)) {
            size = data.length;
            type = "Buffer";

            bytes = data;
        } else if (ArrayBuffer.isView(data)) {
            size = data.byteLength;
            type = data.constructor.name;

            bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        } else if (data instanceof ArrayBuffer) {
            size = data.byteLength;
            type = "ArrayBuffer";

            bytes = new Uint8Array(data);
        } else if (TypeTester.isObject(data) && data.type === "Buffer" && Array.isArray(data.data)) {
            size = data.data.length;
            type = "Buffer";

            bytes = data.data;
        } else if (allowArray && Array.isArray(data)) {
            size = data.length;
            type = "Array";

            bytes = data;
        } else {
            return null;
        }

        let hex = "";

        const limit = Math.min(size, byteLimit);

        for (let i = 0; i < limit; i++) {
            hex += bytes[i].toString(16).padStart(2, "0");
        }

        const dataStr = size > byteLimit ? `${hex}...` : hex;

        return {
            type,
            size,
            data: dataStr
        };
    },

    _jsonReplacer(key, value) {
        const raw = this[key];

        const binary = LoggerUtil.formatBinary(raw) ?? LoggerUtil.formatBinary(value);

        return binary ?? value;
    },

    formatLog(str, splitLength = 80, maxLength = 1000) {
        if (str == null) {
            return " none";
        }

        switch (typeof str) {
            case "bigint":
            case "boolean":
            case "number":
                str = str.toString(10);
                break;
            case "object":
                try {
                    str = JSON.stringify(str, LoggerUtil._jsonReplacer);
                    break;
                } catch (err) {
                    return ` error: ${err.message}`;
                }
            case "string":
                if (Util.empty(str)) {
                    return " none";
                }

                break;
        }

        str = str.replace(/\n|\r\n/g, "\\n");
        str = Util.trimString(str, maxLength, null, {
            showDiff: true
        });

        if (str.length > splitLength) {
            return `\n---\n${str}\n---`;
        } else if (LoggerUtil._quotesExp.test(str)) {
            return " " + str;
        } else {
            return ` "${str}"`;
        }
    }
});

export default LoggerUtil;
