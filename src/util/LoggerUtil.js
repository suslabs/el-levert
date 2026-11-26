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

    _jsonReplacer(key, value, redactText) {
        if (LoggerUtil._sensitiveField.test(key)) {
            return LoggerUtil._redacted;
        }

        const raw = this[key];

        const binary = LoggerUtil.formatBinary(raw) ?? LoggerUtil.formatBinary(value);
        return binary ?? (typeof value === "string" ? redactText(value) : value);
    },

    _redacted: "[redacted]",
    _sensitiveField:
        /^(?:headers|authorization|cookie|set-cookie|credentials|password|(?:api|access|refresh|client|private)[_-]?(?:key|token|secret)|secret|token)$/i,
    _credential:
        /\b(?:github_pat_[\w]+|gh[pousr]_[\w]{20,}|AIza[\w-]{30,}|sk-(?:or-v1-)?[\w-]{20,}|keen_[\w]+_[\da-f]{20,}|tvly-[\w-]{16,}|[\w-]{20,}\.[\w-]{6}\.[\w-]{20,})\b/gi,
    _bearer: /(\b(?:Bearer|Basic) +)[^\s"',;\\]+/gi,
    _credentialAssignment:
        /(\b(?:x[-_]api[-_]key|api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|secret)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&#,;"'}]+)/gi,

    redactText(text, secrets = []) {
        for (const secret of secrets) {
            text = text.replaceAll(secret, LoggerUtil._redacted);
        }

        return text
            .replace(LoggerUtil._credential, LoggerUtil._redacted)
            .replace(LoggerUtil._bearer, `$1${LoggerUtil._redacted}`)
            .replace(LoggerUtil._credentialAssignment, `$1${LoggerUtil._redacted}`);
    },

    formatErrorSummary(err, redactText = LoggerUtil.redactText) {
        const type = err instanceof Error ? err.constructor.name : "Error",
            status = err?.response?.status ?? err?.status ?? err?.ref?.status ?? err?.ref;

        const summary = Number.isInteger(status) && status >= 100 && status <= 599 ? `${type}, HTTP ${status}` : type,
            message = Util.nonemptyString(err?.message) ? redactText(err.message) : "";

        return message === "" ? summary : `${summary}: ${message}`;
    },

    formatLog(str, splitLength = 80, maxLength = 1000, redactText = LoggerUtil.redactText) {
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
                    str = JSON.stringify(str, function (key, value) {
                        return LoggerUtil._jsonReplacer.call(this, key, value, redactText);
                    });
                    break;
                } catch (err) {
                    return ` error: ${redactText(err.message)}`;
                }
            case "string":
                if (str === "") {
                    return " none";
                }

                str = redactText(str);
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
