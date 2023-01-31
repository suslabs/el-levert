function addReply(msg) {
    this.trackedMsgs.push(msg);

    if(this.trackedMsgs.length > 100) {
        this.trackedMsgs.pop();
    }
}

class Handler {
    constructor(enabled = true, hasTracker = true) {
        this.enabled = enabled;

        if(enabled && hasTracker) {
            this.trackedMsgs = [];
            this.addReply = addReply.bind(this);
        }
    }

    async delete(msg) {
        if(!this.enabled) {
            return;
        }

        const ind = this.trackedMsgs.findIndex(x => x.reference.messageId === msg.id);

        if(ind < 0) {
            return;
        }

        await this.trackedMsgs[ind].delete();
        this.trackedMsgs.splice(ind, 1);

    }

    async resubmit(msg) {
        await this.delete(msg);
        await this.execute(msg);
    }
}

export default Handler;