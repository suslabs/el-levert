const FuncTypes = Object.freeze({
    regular: "applySync",
    ignored: "applyIgnored",
    syncPromise: "applySyncPromise"
});

const validFuncTypes = new Set(Object.values(FuncTypes));

const ExecutionTypes = Object.freeze({
    script: "script",
    bot: "bot"
});

export { FuncTypes, validFuncTypes, ExecutionTypes };
