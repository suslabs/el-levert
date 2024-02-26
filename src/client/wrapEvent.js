const wrapEvent = (logger, func) =>
    function (...args) {
        try {
            const out = func(...args);

            if (typeof out === "object" && typeof out.then === "function") {
                out.catch(err => logger?.error(err));
            }

            return out;
        } catch (err) {
            logger?.error(err);
        }
    };

export default wrapEvent;
