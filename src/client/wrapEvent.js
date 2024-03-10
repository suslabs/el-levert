import { isPromise } from "../util/TypeTester.js";

const wrapPromise = (logger, promise) =>
    new Promise((resolve, reject) => {
        promise.then(resolve).catch(err => {
            logger.error(err);
            resolve(undefined);
        });
    });

const wrapEvent = (logger, func) =>
    function (...args) {
        let out;

        try {
            out = func(...args);
        } catch (err) {
            logger.error(err);
            return;
        }

        if (isPromise(out)) {
            out = wrapPromise(logger, out);
        }

        return out;
    };

export default wrapEvent;
