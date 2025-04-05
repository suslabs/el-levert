const FuncTypes = Object.freeze({
    regular: "applySync",
    ignored: "applyIgnored",
    syncPromise: "applySyncPromise"
});

const ExecutionTypes = Object.freeze({
    script: "script",
    bot: "bot"
});

export { FuncTypes, ExecutionTypes };
