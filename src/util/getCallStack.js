function getCallStack() {
    const oldPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack;
    Error.prepareStackTrace = oldPrepareStackTrace;

    if (stack === null || typeof stack !== "object") {
        throw new Error("Invalid callstack");
    }

    return stack;
}

export default getCallStack;
