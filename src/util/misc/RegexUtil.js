import Util from "../Util.js";

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
        if (!match) {
            return null;
        }

        const groups = Object.keys(match.groups).filter(key => typeof match.groups[key] !== "undefined"),
            foundName = groups.find(key => key.startsWith(name));

        return foundName && match.groups[foundName];
    },

    wordStart: (str, idx) => {
        const char = str[idx - 1];
        return idx === 0 || char === " " || !Util.alphanumeric.includes(char);
    },

    wordEnd: (str, idx) => {
        const char = str[idx + 1];
        return idx === str.length || char === " " || !Util.alphanumeric.includes(char);
    },

    getMergedRegex: exps => {
        if (exps.length < 1) {
            return null;
        }

        const regexCtor = exps[0].constructor;

        const expStr = `(?:${exps.map(exp => exp.source).join(")|(?:")})`,
            expFlags = Util.unique(exps.map(exp => exp.flags));

        return new regexCtor(expStr, expFlags);
    },

    multipleReplace: (str, ...rules) => {
        if (rules.length < 1) {
            return str;
        }

        const regexCtor = rules[0][0].constructor,
            matchInfo = [];

        for (const [regex, replacement] of rules) {
            const newFlags = Util.unique(regex.flags + "g"),
                globalRegex = new regexCtor(regex.source, newFlags);

            for (const match of str.matchAll(globalRegex)) {
                const start = match.index,
                    end = match.index + match.length;

                matchInfo.push({ regex, replacement, match, start, end });
            }
        }

        matchInfo.sort((a, b) => a.start - b.start || b.end - a.end);

        let out = [],
            lastIndex = 0;

        for (const info of matchInfo) {
            if (info.start < lastIndex) {
                continue;
            }

            out.push(str.slice(lastIndex, info.start));
            lastIndex = info.end;

            let fullMatch = info.match[0],
                replaced = null;

            if (typeof info.replacement === "function") {
                replaced = info.replacement(fullMatch, ...info.match.slice(1), info.start, str);
            } else {
                replaced = fullMatch.replace(info.regex, info.replacement);
            }

            out.push(replaced ?? "");
        }

        out.push(str.slice(lastIndex));
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
