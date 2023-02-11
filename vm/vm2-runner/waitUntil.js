const waitUntil = (condition) => {
    if(condition()) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if(!condition()) {
                return;
            }

            clearInterval(interval);
            resolve();
        }, 0);
    });
};

export default waitUntil;