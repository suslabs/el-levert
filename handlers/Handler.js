function addMsg(msg, trigger_id) {
    if(this.trackedMsgs.size >= this.trackLimit) {
        cosnt [key] = this.trackedMsgs.keys();
        this.trackedMsgs.delete(key);
    }

    this.trackedMsgs.set(trigger_id, msg);
}

function deleteMsg(trigger_id) {
    if(!this.enabled) {
        return;
    }

    const sentMsg = this.trackedMsgs.get(trigger_id);
    
    if(typeof sentMsg === "undefined") {
        return;
    }

    return sentMsg;
}

class Handler {
    constructor(enabled = true, hasTracker = true) {
        this.enabled = enabled;

        if(enabled && hasTracker) {
            this.trackLimit = 100;
            this.trackedMsgs = new Map();

            this.addMsg = addMsg.bind(this);
            this.deleteMsg = deleteMsg.bind(this);
        }
    }

    async delete(msg) {
        const sentMsg = this.deleteMsg(msg.id);

        if(typeof sentMsg === "undefined") {
            return;
        }

        if(sentMsg.constructor.name === "Array") {
            for(const sent of sentMsg) {
                await sent.delete();
            }
        } else {
            await sentMsg.delete();
        }
    }

    async resubmit(msg) {
        await this.delete(msg);
        await this.execute(msg);
    }
}

export default Handler;