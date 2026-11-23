import createEnum from "../../util/createEnum.js";

const TagContentTypes = createEnum({
    scriptJavascript: "application/javascript",
    scriptTextJavascript: "text/javascript",
    plainText: "text/plain",
    json: "application/json",
    binaryOctetStream: "application/octet-stream"
});

const scriptContentTypes = [TagContentTypes.scriptJavascript, TagContentTypes.scriptTextJavascript],
    textContentTypes = [TagContentTypes.plainText, TagContentTypes.json],
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
