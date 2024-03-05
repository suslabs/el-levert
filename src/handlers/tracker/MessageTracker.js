class MessageTracker {
    constructor(trackLimit = 100) {
        this.trackLimit = trackLimit;
        this.trackedMsgs = new Map();
    }

    addMsg(msg, triggerId) {
        if (this.trackedMsgs.size >= this.trackLimit) {
            const [key] = this.trackedMsgs.keys();
            this.trackedMsgs.delete(key);
        }

        this.trackedMsgs.set(triggerId, msg);
    }

    deleteMsg(triggerId) {
        const sentMsg = this.trackedMsgs.get(triggerId);
        this.trackedMsgs.delete(triggerId);

        return sentMsg;
    }

    clearMsgs() {
        this.trackedMsgs.clear();
    }
}

export default MessageTracker;
