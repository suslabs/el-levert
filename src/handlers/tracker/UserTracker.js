import TrackedUser from "./TrackedUser.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";

class UserTracker {
    constructor(sweepInterval = 0) {
        this.sweepInterval = sweepInterval;
        this.enableChecks = sweepInterval > 0;

        this.trackedUsers = [];

        this._sweepTimer = null;

        if (this.enableChecks) {
            this._setSweepInterval();
        }
    }

    findUser(id) {
        return this.trackedUsers.find(user => user.id === id);
    }

    addUser(id) {
        if (typeof id === "object") {
            id = id.id;
        }

        const user = new TrackedUser(id, Date.now());
        this.trackedUsers.push(user);
    }

    removeUser(id) {
        if (typeof id === "object") {
            ArrayUtil.removeItem(this.trackedUsers, id);
        } else {
            ArrayUtil.removeItem(this.trackedUsers, user => user.id === id);
        }
    }

    clearUsers() {
        ArrayUtil.wipeArray(this.trackedUsers);
    }

    _sweepUsers() {
        const removed = [];

        for (const user of this.trackedUsers) {
            const dt = Util.timeDelta(Date.now(), user.time);

            if (dt > this.sweepInterval) {
                removed.push(user);
            }
        }

        for (const user of removed) {
            this.removeUser(user);
        }
    }

    _setSweepInterval() {
        if (this._sweepTimer !== null) {
            this._clearSweepInterval();
        }

        const sweepUsersFunc = this._sweepUsers.bind(this);
        this._sweepTimer = setInterval(sweepUsersFunc, this.sweepInterval);
    }

    _clearSweepInterval() {
        if (this._sweepTimer === null) {
            return;
        }

        clearInterval(this._sweepTimer);
        this._sweepTimer = null;
    }
}

export default UserTracker;
