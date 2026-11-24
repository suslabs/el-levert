import createEnum from "../../util/createEnum.js";

const MarkdownStyles = createEnum({
    bold: "**",
    italic: "*",
    strike: "~~",
    underline: "__"
});

export default MarkdownStyles;
