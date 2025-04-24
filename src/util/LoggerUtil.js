import Util from "./Util.js";

const LoggerUtil = Object.freeze({
    _quotesExp: /^(["'`])[\s\S]*\1$/,
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
                    str = JSON.stringify(str);
                    break;
                } catch (err) {
                    return ` error: ${err.message}`;
                }
            case "string":
                if (str.length < 1) {
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
