import TrackedUser from "./TrackedUser.js";

function sweepUsers() {
    for (const user of this.trackedUsers) {
        const timeDiff = Date.now() - user.time;

        if (timeDiff > this.sweepInterval) {
            this.removeUser(user.id);
        }
    }
}

class UserTracker {
    constructor(sweepInterval = 0) {
        this.sweepInterval = sweepInterval;
        this.trackedUsers = [];

        const enableChecks = sweepInterval > 0;
        this.enableChecks = enableChecks;

        if (enableChecks) {
            this.setSweepInterval();
        }
    }

    searchUser(id) {
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

    setSweepInterval() {
        if (typeof this.sweepTimer !== "undefined") {
            this.clearSweepInterval();
        }

        const sweepUsersFunc = sweepUsers.bind(this);
        this.sweepTimer = setInterval(sweepUsersFunc, this.sweepInterval);
    }

    clearSweepInterval() {
        if (typeof this.sweepTimer === "undefined") {
            return;
        }

        clearInterval(this.sweepTimer);
        delete this.sweepTimer;
    }
}

export default UserTracker;
