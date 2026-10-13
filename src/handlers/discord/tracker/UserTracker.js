import TimedTracker from "./TimedTracker.js";

class UserTracker extends TimedTracker {
    static itemName = "user";

    static {
        this._init();
    }
}

export default UserTracker;
