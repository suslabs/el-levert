import Util from "../../util/Util.js";

const MarkdownParser = Object.freeze({
    _getHeadingRegex: level => {
        return new RegExp(`^${"#".repeat(level)} `, "m");
    },

    splitSections: (text, level = 2) => {
        return String(text)
            .split(MarkdownParser._getHeadingRegex(level))
            .filter(Util.nonemptyString)
            .map(part => {
                const [title, ...lines] = part.split("\n");
                return { title: title.trim(), text: lines.join("\n").trim() };
            });
    }
});

export default MarkdownParser;
