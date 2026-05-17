const TagContentTypes = Object.freeze({
    scriptJavascript: "application/javascript",
    scriptTextJavascript: "text/javascript",
    plainText: "text/plain"
});

const scriptContentTypes = [TagContentTypes.scriptJavascript, TagContentTypes.scriptTextJavascript],
    fileContentTypes = scriptContentTypes.concat([TagContentTypes.plainText]);

export { TagContentTypes, scriptContentTypes, fileContentTypes };
