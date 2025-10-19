import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";

import HandlerError from "../../../errors/HandlerError.js";

class UserTracker {
    constructor(sweepInterval = 0) {
        this.sweepInterval = sweepInterval;
        this.enableChecks = sweepInterval > 0;

        this.trackedUsers = [];

        this._sweepTimer = null;

        if (this.enableChecks) {
            this._startSweepLoop();
        }
    }

    findUser(id) {
        id = UserTracker._getUserId(id);

        if (id == null) {
            return null;
        }

        const user = this.trackedUsers.find(user => user.id === id);
        return user ?? null;
    }

    hasUser(id) {
        return this.findUser(id) !== null;
    }

    addUser(id) {
        id = UserTracker._getUserId(id);

        if (id == null) {
            return false;
        }

        const user = UserTracker._createUser(id);
        this.trackedUsers.push(user);

        return true;
    }

    removeUser(id) {
        id = UserTracker._getUserId(id);

        if (id == null) {
            return null;
        }

        const [, user] = ArrayUtil.removeItem(this.trackedUsers, user => user.id === id);
        return user ?? null;
    }

    withUser(id, callback) {
        if (typeof callback !== "function") {
            throw new HandlerError("Callback function required");
        }

        if (this.hasUser(id)) {
            throw new HandlerError("User already exists", id);
        } else if (!this.addUser(id)) {
            return;
        }

        let res = null;

        try {
            res = callback();
        } catch (err) {
            this.removeUser(id);
            throw err;
        }

        if (TypeTester.isPromise(res)) {
            return res.finally(() => this.removeUser(id));
        } else {
            this.removeUser(id);
            return res;
        }
    }

    clearUsers() {
        ArrayUtil.wipeArray(this.trackedUsers);
    }

    static _getUserId(id) {
        return TypeTester.isObject(id) ? id.id : id;
    }

    static _createUser(id) {
        return {
            id,
            timestamp: Date.now()
        };
    }

    _sweepUsers = () => {
        const removed = [];

        for (const user of this.trackedUsers) {
            const dt = Util.timeDelta(Date.now(), user.timestamp);

            if (dt > this.sweepInterval) {
                removed.push(user);
            }
        }

        for (const user of removed) {
            this.removeUser(user);
        }
    };

    _startSweepLoop() {
        if (this._sweepTimer !== null) {
            this._stopSweepLoop();
        }

        this._sweepTimer = setInterval(this._sweepUsers, this.sweepInterval);
    }

    _stopSweepLoop() {
        if (this._sweepTimer === null) {
            return;
        }

        clearInterval(this._sweepTimer);
        this._sweepTimer = null;
    }
}

export default UserTracker;
