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
    }
});

export default RegexUtil;
