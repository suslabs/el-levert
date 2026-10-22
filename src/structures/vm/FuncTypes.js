import createEnum from "../../util/createEnum.js";

const FuncTypes = createEnum({
    regular: "applySync",
    ignored: "applyIgnored",
    syncPromise: "applySyncPromise"
});

const ExecutionTypes = createEnum({
    script: "script",
    bot: "bot"
});

export { FuncTypes, ExecutionTypes };
