import TypeTester from "../util/TypeTester.js";

function wrapOutput(out, logger) {
    if (TypeTester.isPromise(out)) {
        return out.catch(err => logger.error("Event exception:", err));
    } else {
        return out;
    }
}

function wrapEvent(logger, func) {
    return function (...args) {
        try {
            const out = func(...args);
            return wrapOutput(out, logger);
        } catch (err) {
            logger.error("Event exception:", err);
            return;
        }
    };
}

export default wrapEvent;
