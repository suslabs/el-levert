function tagTester(name) {
    const tag = "[object " + name + "]";

    return obj => toString.call(obj) === tag;
}

const isFunction = tagTester("Function");

function isPromise(obj) {
    if (typeof obj !== "object") {
        return false;
    }

    return isFunction(obj.then) && isFunction(obj.catch);
}

const wrapPromise = (logger, promise) =>
    new Promise((resolve, reject) => {
        promise.then(resolve).catch(err => {
            logger.error(err);
            resolve();
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
