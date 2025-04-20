class MessageTracker {
    constructor(trackLimit = 100) {
        this.trackLimit = trackLimit;
        this.enableTracking = trackLimit > 0;

        if (this.enableTracking) {
            this.trackedMsgs = new Map();
        }
    }

    addMsg(msg, triggerId) {
        if (!this.enableTracking || triggerId == null) {
            return;
        }

        if (this.trackedMsgs.size >= this.trackLimit) {
            const oldest = this.trackedMsgs.keys().next().value;
            this.trackedMsgs.delete(oldest);
        }

        this.trackedMsgs.set(triggerId, msg);
    }

    deleteMsg(triggerId) {
        if (!this.enableTracking || triggerId == null) {
            return;
        }

        const sentMsg = this.trackedMsgs.get(triggerId);
        this.trackedMsgs.delete(triggerId);

        return sentMsg;
    }

    clearMsgs() {
        this.trackedMsgs.clear();
    }
}

export default MessageTracker;
