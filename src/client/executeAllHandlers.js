let inProcessIds = [];

function isProcessing(msg_id) {
    return inProcessIds.includes(msg_id);
}

function addId(msg_id) {
    inProcessIds.push(msg_id);
}

function removeId(msg_id) {
    inProcessIds = inProcessIds.filter(x => x !== msg_id);
}

async function executeAllHandlers(client, funcName, msg, ...args) {
    if (isProcessing(msg.id)) {
        return;
    }

    addId(msg.id);

    for (const handler of client.handlerList) {
        const handlerFunc = handler[funcName].bind(handler),
            out = await handlerFunc(msg, ...args);

        if (out) {
            break;
        }
    }

    removeId(msg.id);
}

export default executeAllHandlers;
