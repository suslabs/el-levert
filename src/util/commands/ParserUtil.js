import TypeTester from "../TypeTester.js";
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

        if (sep.length === 0) {
            if (lowercaseFirst) {
                return [str.toLowerCase(), ""];
            } else {
                return [str, ""];
            }
        }

        if (!Array.isArray(sep)) {
            sep = [sep];
        }

        let first, second;

        let ind = -1,
            sepLength;

        if (sep.length === 1) {
            sep = sep[0] ?? sep;

            ind = str.indexOf(sep);
            sepLength = sep.length;

            if (n > 1) {
                for (let i = 1; i < n; i++) {
                    ind = str.indexOf(sep, ind + 1);

                    if (ind === -1) {
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
                    ind = match.index;
                    sepLength = match[0].length;
                }
            } else {
                let match;

                for (let i = 1; (match = exp.exec(str)) !== null; i++) {
                    if (i === n) {
                        ind = match.index;
                        sepLength = match[0].length;

                        break;
                    } else if (i > n) {
                        ind = -1;
                        break;
                    }
                }
            }
        }

        if (ind === -1) {
            first = str;
            second = "";
        } else {
            first = str.slice(0, ind);
            second = str.slice(ind + sepLength);
        }

        if (lowercaseFirst) {
            first = first.toLowerCase();
        }

        if (lowercaseSecond) {
            second = second.toLowerCase();
        }

        return [first, second];
    },

    _parseScirptResult: (body, isScript = false, lang = "") => ({ body, isScript, lang }),

    parseScript: script => {
        const match = script.match(DiscordUtil.parseScriptRegex);

        if (!match) {
            return ParserUtil._parseScirptResult(script);
        }

        const body = (match[2] ?? match[3])?.trim(),
            lang = match[1]?.trim() ?? "";

        if (typeof body === "undefined") {
            return ParserUtil._parseScirptResult(script);
        }

        return ParserUtil._parseScirptResult(body, true, lang);
    }
});

export default ParserUtil;
