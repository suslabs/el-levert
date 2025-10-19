import MessageTracker from "./MessageTracker.js";

class ReplyTracker extends MessageTracker {
    static listNames = {
        reply: "replies"
    };

    static {
        this._init();
    }
}

export default ReplyTracker;
