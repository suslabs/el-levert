let logger_;

function exceptionHandler(err1) {
    try {
        logger_.error("Uncaught exception:", err1);
    } catch (err2) {
        console.error("Error occured while reporting uncaught error:");
        console.error(err2);

        console.error("Uncaught error:");
        console.error(err1);
    }
}

function rejectionHandler(reason, promise) {
    logger_.error("Unhandled promise rejection:", reason);
}

function registerGlobalErrorHandler(logger) {
    logger_ = logger;

    process.on("unhandledRejection", rejectionHandler);
    process.on("uncaughtException", exceptionHandler);

    logger_.info("Registered global error handler.");
}

function removeGlobalErrorHandler() {
    process.removeListener("unhandledRejection", rejectionHandler);
    process.removeListener("uncaughtException", exceptionHandler);

    logger_.info("Removed global error handler.");
    logger_ = undefined;
}

export { registerGlobalErrorHandler, removeGlobalErrorHandler };
