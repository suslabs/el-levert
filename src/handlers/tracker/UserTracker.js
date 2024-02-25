import TrackedUser from "./TrackedUser.js";

function checkUsers() {
    for (const user of this.trackedUsers) {
        const timeDiff = Date.now() - user.time;

        if (timeDiff > this.checkInterval) {
            this.removeUser(user.id);
        }
    }
}

class UserTracker {
    constructor(checkInterval = 0) {
        this.checkInterval = checkInterval;
        this.trackedUsers = [];

        const enableChecks = checkInterval > 0;
        this.enableChecks = enableChecks;

        if (enableChecks) {
            this.setCheckInterval();
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

    setCheckInterval() {
        const checkUsersFunc = checkUsers.bind(this);
        this.checkInterval = setInterval(checkUsersFunc, this.checkInterval);
    }

    clearCheckInterval() {
        clearInterval(this.checkInterval);
        delete this.checkInterval;
    }
}

export default UserTracker;
