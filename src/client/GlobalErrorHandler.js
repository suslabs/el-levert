let _logger;

function exceptionHandler(err1) {
    try {
        _logger.error("Uncaught exception:", err1);
    } catch (err2) {
        console.error("Error occured while reporting uncaught error:");
        console.error(err2);

        console.error("Uncaught error:");
        console.error(err1);
    }
}

function rejectionHandler(reason, promise) {
    _logger.error("Unhandled promise rejection:", reason);
}

function registerGlobalErrorHandler(logger) {
    _logger = logger;

    process.on("unhandledRejection", rejectionHandler);
    process.on("uncaughtException", exceptionHandler);

    _logger.info("Registered global error handler.");
}

function removeGlobalErrorHandler() {
    process.removeListener("unhandledRejection", rejectionHandler);
    process.removeListener("uncaughtException", exceptionHandler);

    _logger.info("Removed global error handler.");
    _logger = undefined;
}

export { registerGlobalErrorHandler, removeGlobalErrorHandler };
