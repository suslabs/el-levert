const ConsoleLevels = Object.freeze({
    debug: "debug",
    info: "info",
    log: "log",
    warn: "warn",
    error: "error"
});

const validConsoleLevels = new Set(Object.values(ConsoleLevels));

export { ConsoleLevels, validConsoleLevels };
