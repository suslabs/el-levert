import createEnum from "../../util/createEnum.js";

const MessageLimitTypes = createEnum({
    default: "default",
    none: "none",
    error: "error",
    file: "file",
    trim: "trim"
});

export default MessageLimitTypes;
