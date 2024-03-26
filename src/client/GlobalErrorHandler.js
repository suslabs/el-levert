let logger_;

function errorHandler(err1) {
    try {
        logger_.error("Uncaught exception:", err1);
    } catch (err2) {
        console.error("Error occured while reporting uncaught error:", err2);
        console.error("Uncaught error:", err1);
    }
}

function registerGlobalErrorHandler(logger) {
    logger_ = logger;
    process.on("uncaughtException", errorHandler);
}

function removeGlobalErrorHandler() {
    logger_ = undefined;
    process.removeAllListeners("uncaughtException");
}

export { registerGlobalErrorHandler, removeGlobalErrorHandler };
