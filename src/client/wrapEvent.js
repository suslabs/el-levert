import TypeTester from "../util/TypeTester.js";

const wrapPromise = (logger, promise) =>
    new Promise((resolve, reject) => {
        promise.then(resolve).catch(err => {
            logger.error("Event exception:", err);
            resolve();
        });
    });

const wrapEvent = (logger, func) =>
    function (...args) {
        let out;

        try {
            out = func(...args);
        } catch (err) {
            logger.error("Event exception:", err);
            return;
        }

        return TypeTester.isPromise(out) ? wrapPromise(logger, out) : out;
    };

export default wrapEvent;
