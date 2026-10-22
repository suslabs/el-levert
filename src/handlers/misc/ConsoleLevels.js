import createEnum from "../../util/createEnum.js";

const ConsoleLevels = createEnum({
    debug: "debug",
    info: "info",
    log: "log",
    warn: "warn",
    error: "error"
});

export default ConsoleLevels;
