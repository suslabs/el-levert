import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import TypeTester from "../TypeTester.js";

const RegexUtil = Object.freeze({
    _regexEscapeRegex: /[.*+?^${}()|[\]\\]/g,
    escapeRegex: str => {
        return str.replace(RegexUtil._regexEscapeRegex, "\\$&");
    },

    _charClassExcapeRegex: /[-\\\]^]/g,
    escapeCharClass: str => {
        return str.replace(RegexUtil._charClassExcapeRegex, "\\$&");
    },

    flagsRegex: /^[gimsuy]*$/,

    validFlags: flags => {
        return RegexUtil.flagsRegex.test(flags) && !Util.hasDuplicates(flags);
    },

    firstGroup: (match, name) => {
        if (!match || typeof match.groups === "undefined") {
            return null;
        }

        const foundName = Object.entries(match.groups).find(
            ([key, value]) => typeof value !== "undefined" && key.startsWith(name)
        )?.[0];

        return foundName && match.groups[foundName];
    },

    wordStart: (str, idx) => {
        const char = str[idx - 1];
        return idx <= 0 || char === " " || !Util.alphanumeric.includes(char);
    },

    wordEnd: (str, idx) => {
        const char = str[idx + 1];
        return idx >= str.length - 1 || char === " " || !Util.alphanumeric.includes(char);
    },

    getWordRegex: (words, flags = "gu") => {
        words = ArrayUtil.guaranteeArray(words, null, true);
        const validWords = [...new Set(words.filter(word => typeof word === "string" && !Util.empty(word)))];

        if (Util.empty(validWords)) {
            return null;
        }

        const expFlags = Util.unique(flags.includes("u") ? flags : flags + "u"),
            patterns = validWords
                .map(word => RegexUtil.escapeRegex(word))
                .sort((a, b) => b.length - a.length || a.localeCompare(b));

        return new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join("|")})(?![\\p{L}\\p{N}])`, expFlags);
    },

    getMergedRegex: exps => {
        exps = Array.isArray(exps) ? exps.filter(TypeTester.isRegex) : [];

        if (exps.length < 1) {
            return null;
        }

        const regexCtor = exps[0].constructor;

        const expText = `(?:${exps.map(exp => exp.source).join(")|(?:")})`,
            expFlags = Util.unique(exps.map(exp => exp.flags).join(""));

        return new regexCtor(expText, expFlags);
    },

    _substituteRegex: /\$([$&`']|\d{1,2}|<([^>]+)>)/g,

    _evaluateReplacement: (replacement, match, str) => {
        if (typeof replacement === "function") {
            return replacement(match[0], ...match.slice(1), match.index, str);
        }

        if (typeof replacement !== "string" || !replacement.includes("$")) {
            return String(replacement ?? "");
        }

        return replacement.replace(RegexUtil._substituteRegex, (fullToken, token, groupName) => {
            if (token === "$") {
                return "$";
            } else if (token === "&") {
                return match[0];
            } else if (token === "`") {
                return str.slice(0, match.index);
            } else if (token === "'") {
                return str.slice(match.index + match[0].length);
            } else if (groupName && match.groups) {
                return match.groups[groupName] ?? "";
            }

            const num = Number(token);

            if (!Number.isNaN(num) && num > 0 && num < match.length) {
                return match[num] ?? "";
            }

            return fullToken;
        });
    },

    multipleReplace: (str, rules = []) => {
        if (rules.length < 1) {
            return str;
        }

        const regexCtor = rules[0][0].constructor;

        const ruleEntries = rules.map(([regex, replacement], idx) => {
            const isGlobal = regex.flags.includes("g"),
                newFlags = Util.unique(regex.flags + "g");

            return {
                idx,
                regex,
                replacement,
                isGlobal,
                scanner: new regexCtor(regex.source, newFlags)
            };
        });

        const activeRules = new Set(ruleEntries),
            out = [];

        let cursor = 0;

        while (cursor < str.length && activeRules.size > 0) {
            let bestMatch = null,
                bestRule = null;

            for (const rule of activeRules) {
                rule.scanner.lastIndex = cursor;
                const match = rule.scanner.exec(str);

                if (match === null) {
                    activeRules.delete(rule);
                    continue;
                }

                const isEarlier = bestMatch === null || match.index < bestMatch.index,
                    isTieBreak = bestMatch !== null && match.index === bestMatch.index && rule.idx < bestRule.idx;

                if (isEarlier || isTieBreak) {
                    bestMatch = match;
                    bestRule = rule;

                    if (bestMatch.index === cursor && bestRule.idx === 0) {
                        break;
                    }
                }
            }

            if (bestMatch === null) {
                break;
            }

            out.push(str.slice(cursor, bestMatch.index));
            out.push(RegexUtil._evaluateReplacement(bestRule.replacement, bestMatch, str));

            const matchLength = Math.max(bestMatch[0].length, 1);
            cursor = bestMatch.index + matchLength;

            if (!bestRule.isGlobal) {
                activeRules.delete(bestRule);
            }
        }

        out.push(str.slice(cursor));
        return out.join("");
    },

    _templateReplaceRegex: /(?<!\\){{(.*?)}}(?!\\)/g,
    templateReplace: (template, strings) => {
        return template.replace(RegexUtil._templateReplaceRegex, (match, key) => {
            key = key.trim();
            return strings[key] ?? match;
        });
    }
});

export default RegexUtil;
