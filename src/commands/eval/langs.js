function formatNames(langNames) {
    const format = Object.keys(langNames)
        .map((x, i) => `${i + 1}. ${x} - **${langNames[x]}**`)
        .join("\n");

    return format;
}

export default {
    name: "langs",
    parent: "eval",
    subcommand: true,
    handler: function () {
        const format = formatNames(this.parentCmd.langNames);

        return `:information_source: Supported languages:
\`\`\`
${format}
\`\`\``;
    }
};
