import TimedTracker from "./TimedTracker.js";

import Util from "../../../util/Util.js";

class ConversationTracker extends TimedTracker {
    static itemName = "conversation";

    static {
        this._init();
    }

    constructor(sweepInterval = 30 / Util.durationSeconds.milli) {
        super(sweepInterval);
    }
}

export default ConversationTracker;
