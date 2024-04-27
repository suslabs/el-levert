let logger_;

function exceptionHandler(err1) {
    try {
        logger_.error("Uncaught exception:", err1);
    } catch (err2) {
        console.error("Error occured while reporting uncaught error:", err2);
        console.error("Uncaught error:", err1);
    }
}

function rejectionHandler(reason, promise) {
    logger_.error("Unhandled rejection at:", promise, `\nReason: ${reason}`);
}

function registerGlobalErrorHandler(logger) {
    logger_ = logger;

    process.on("unhandledRejection", rejectionHandler);
    process.on("uncaughtException", exceptionHandler);
}

function removeGlobalErrorHandler() {
    logger_ = undefined;

    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");
}

export { registerGlobalErrorHandler, removeGlobalErrorHandler };
