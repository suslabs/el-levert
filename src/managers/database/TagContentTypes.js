const TagContentTypes = Object.freeze({
    scriptJavascript: "application/javascript",
    scriptTextJavascript: "text/javascript",
    plainText: "text/plain",
    binaryOctetStream: "application/octet-stream"
});

const scriptContentTypes = [TagContentTypes.scriptJavascript, TagContentTypes.scriptTextJavascript],
    textContentTypes = [TagContentTypes.plainText],
    binaryContentTypes = [TagContentTypes.binaryOctetStream];

const binaryExtensions = ["", ".bin"],
    fileContentTypes = scriptContentTypes.concat(textContentTypes, binaryContentTypes);

export {
    TagContentTypes,
    scriptContentTypes,
    textContentTypes,
    binaryContentTypes,
    binaryExtensions,
    fileContentTypes
};
