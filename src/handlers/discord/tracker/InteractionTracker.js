import TimedTracker from "./TimedTracker.js";

import Util from "../../../util/Util.js";

class InteractionTracker extends TimedTracker {
    static itemName = "session";

    static {
        this._init();
    }

    constructor(sweepInterval = 30 / Util.durationSeconds.milli) {
        super(sweepInterval);
    }
}

export default InteractionTracker;
