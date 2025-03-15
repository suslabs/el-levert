import TrackedUser from "./TrackedUser.js";

import Util from "../../util/Util.js";

class UserTracker {
    constructor(sweepInterval = 0) {
        this.sweepInterval = sweepInterval;
        this.enableChecks = sweepInterval > 0;

        this.trackedUsers = [];

        this._sweepTimer = null;

        if (enableChecks) {
            this._setSweepInterval();
        }
    }

    findUser(id) {
        return this.trackedUsers.find(x => x.id === id);
    }

    addUser(id) {
        const user = new TrackedUser(id, Date.now());
        this.trackedUsers.push(user);
    }

    removeUser(id) {
        this.trackedUsers = this.trackedUsers.filter(x => x.id !== id);
    }

    clearUsers() {
        while (!Util.empty(this.trackedUsers)) {
            this.trackedUsers.pop();
        }
    }

    _sweepUsers() {
        for (const user of this.trackedUsers) {
            const timeDiff = Date.now() - user.time;

            if (timeDiff > this.sweepInterval) {
                this.removeUser(user.id);
            }
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
