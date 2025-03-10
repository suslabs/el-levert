import TrackedUser from "./TrackedUser.js";

class UserTracker {
    constructor(sweepInterval = 0) {
        this.sweepInterval = sweepInterval;
        this.trackedUsers = [];

        const enableChecks = sweepInterval > 0;
        this.enableChecks = enableChecks;

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
        while (this.trackedUsers.length > 0) {
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
        if (typeof this._sweepTimer !== "undefined") {
            this._clearSweepInterval();
        }

        const sweepUsersFunc = this._sweepUsers.bind(this);
        this._sweepTimer = setInterval(sweepUsersFunc, this.sweepInterval);
    }

    _clearSweepInterval() {
        if (typeof this._sweepTimer === "undefined") {
            return;
        }

        clearInterval(this._sweepTimer);
        delete this._sweepTimer;
    }
}

export default UserTracker;
