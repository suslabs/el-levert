import { getClient } from "../LevertClient.js";

const inProcessIds = [];

function isProcessing(msg_id) {
    return inProcessIds.includes(msg_id);
}

function addId(msg_id) {
    inProcessIds.push(msg_id);
}

function removeId(msg_id) {
    inProcessIds = inProcessIds.filter(x => x !== msg_id);
}

async function executeAllHandlers(func, msg, ...args) {
    if (isProcessing(msg.id)) {
        return;
    }

    addId(msg.id);
    const handlerList = this.handlerList;

    for (const handler of handlerList) {
        const handlerFunc = handler[func].bind(handler),
            out = await handlerFunc(msg, ...args);

        if (out) {
            removeId(msg.id);
            return;
        }
    }
}

export default executeAllHandlers;
