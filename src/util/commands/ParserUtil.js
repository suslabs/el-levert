import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ArrayUtil from "../ArrayUtil.js";
import RegexUtil from "../misc/RegexUtil.js";
import DiscordUtil from "../DiscordUtil.js";

const ParserUtil = Object.freeze({
    splitArgs: (str, lowercase = false, options = {}) => {
        let multipleLowercase = Array.isArray(lowercase);

        if (!multipleLowercase && TypeTester.isObject(lowercase)) {
            options = lowercase;

            lowercase = options.lowercase ?? false;
            multipleLowercase = Array.isArray(lowercase);
        }

        const lowercaseFirst = multipleLowercase ? (lowercase[0] ?? false) : lowercase,
            lowercaseSecond = multipleLowercase ? (lowercase[1] ?? false) : false;

        let sep = options.sep ?? [" ", "\n"],
            n = options.n ?? 1;

        if (Util.empty(sep)) {
            return [lowercaseFirst ? str.toLowerCase() : str, ""];
        } else {
            sep = ArrayUtil.guaranteeArray(sep);
        }

        let first, second;

        let idx = -1,
            sepLength;

        if (Util.single(sep)) {
            sep = sep[0] ?? sep;

            idx = str.indexOf(sep);
            sepLength = sep.length;

            if (n > 1) {
                for (let i = 1; i < n; i++) {
                    idx = str.indexOf(sep, idx + 1);

                    if (idx === -1) {
                        break;
                    }
                }
            }
        } else {
            const escaped = sep.map(item => RegexUtil.escapeRegex(item)),
                exp = new RegExp(escaped.join("|"), "g");

            if (n <= 1) {
                const match = exp.exec(str);

                if (match) {
                    idx = match.index;
                    sepLength = match[0].length;
                }
            } else {
                for (let i = 1, match; (match = exp.exec(str)) !== null; i++) {
                    if (i === n) {
                        idx = match.index;
                        sepLength = match[0].length;

                        break;
                    } else if (i > n) {
                        idx = -1;
                        break;
                    }
                }
            }
        }

        if (idx === -1) {
            first = str;
            second = "";
        } else {
            first = str.slice(0, idx);
            second = str.slice(idx + sepLength);
        }

        return [lowercaseFirst ? first.toLowerCase() : first, lowercaseSecond ? second.toLowerCase() : second];
    },

    _parseScriptResult: (body, isScript = false, lang = "") => ({ body, isScript, lang }),
    parseScript: script => {
        const match = script.match(DiscordUtil.parseScriptRegex);

        if (!match) {
            return ParserUtil._parseScriptResult(script);
        }

        const body = (match[2] ?? match[3])?.trim(),
            lang = match[1]?.trim() ?? "";

        return typeof body === "undefined"
            ? ParserUtil._parseScriptResult(script)
            : ParserUtil._parseScriptResult(body, true, lang);
    }
});

export default ParserUtil;
