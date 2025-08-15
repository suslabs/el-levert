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

    firstGroup: (match, name) => {
        if (!match) {
            return;
        }

        const groups = Object.keys(match.groups).filter(key => typeof match.groups[key] !== "undefined"),
            foundName = groups.find(key => key.startsWith(name));

        if (typeof foundName === "undefined") {
            return;
        }

        return match.groups[foundName];
    },

    wordStart: (str, idx) => {
        const char = str[idx - 1];
        return idx === 0 || char === " " || !Util.alphanumeric.includes();
    },

    wordEnd: (str, idx) => {
        const char = str[idx + 1];
        return idx === str.length || char === " " || !Util.alphanumeric.includes(char);
    }
});

export default RegexUtil;
