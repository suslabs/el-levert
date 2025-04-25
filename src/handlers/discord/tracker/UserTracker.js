import TrackedUser from "./TrackedUser.js";

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
            this._setSweepInterval();
        }
    }

    findUser(id) {
        if (TypeTester.isObject(id)) {
            id = id.id;
        }

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
        if (TypeTester.isObject(id)) {
            id = id.id;
        }

        if (id == null) {
            return false;
        }

        const user = new TrackedUser(id, Date.now());
        this.trackedUsers.push(user);

        return true;
    }

    removeUser(id) {
        if (TypeTester.isObject(id)) {
            id = id.id;
        }

        if (id == null) {
            return;
        }

        return ArrayUtil.removeItem(this.trackedUsers, user => user.id === id);
    }

    withUser(id, callback) {
        if (typeof callback !== "function") {
            throw new HandlerError("Callback function required");
        }

        if (this.hasUser(id)) {
            throw new HandlerError("User already exists");
        }

        const added = this.addUser(id);

        if (!added) {
            return;
        }

        try {
            const res = callback();

            if (TypeTester.isPromise(res)) {
                return res.finally(() => this.removeUser(id));
            }

            return res;
        } finally {
            this.removeUser(id);
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
