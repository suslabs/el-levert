import MessageTracker from "./MessageTracker.js";

class ReactionTracker extends MessageTracker {
    static listNames = {
        reaction: "reactions"
    };

    static {
        this._init();
    }
}

export default ReactionTracker;
