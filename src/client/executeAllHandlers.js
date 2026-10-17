const inProcessIds = new Set();

async function executeAllHandlers(client, funcName, msg, ...args) {
    if (inProcessIds.has(msg.id)) {
        return;
    }

    inProcessIds.add(msg.id);

    try {
        for (const handler of client.handlerList) {
            if (handler.handlesMessages) {
                const handlerFunc = handler[funcName].bind(handler),
                    executed = await handlerFunc(msg, ...args);

                if (executed) {
                    break;
                }
            }
        }
    } finally {
        inProcessIds.delete(msg.id);
    }
}

export default executeAllHandlers;
