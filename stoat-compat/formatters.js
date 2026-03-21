const TimestampStyles = {
    ShortDateTime: "f",
    RelativeTime: "R"
};

function bold(str) {
    return `**${str}**`;
}

function inlineCode(str) {
    return `\`${str}\``;
}

function codeBlock(langOrText, maybeText) {
    let language = "",
        text = langOrText;

    if (typeof maybeText !== "undefined") {
        language = langOrText ?? "";
        text = maybeText;
    }

    return `\`\`\`${language}\n${text ?? ""}\n\`\`\``;
}

function escapeMarkdown(str) {
    if (typeof str !== "string") {
        return str;
    }

    return str.replaceAll(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1");
}

function hyperlink(text, url) {
    return `${text} (${url})`;
}

function time(timestamp, style = TimestampStyles.ShortDateTime) {
    return `<t:${Math.round(timestamp)}:${style}>`;
}

export { TimestampStyles, escapeMarkdown, bold, inlineCode, codeBlock, hyperlink, time };
