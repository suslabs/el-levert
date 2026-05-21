import ivm from "isolated-vm";

import getEventLoopCode from "../../../util/vm/getEventLoopCode.js";

class EventLoop {
    constructor(context) {
        this.context = context;

        this._nextTimerId = 1;
        this._pendingTimers = new Map();
        this._disposed = false;
    }

    setup() {
        this._setupRegisterTimeout();
        this._setupRegisterInterval();
        this._setupClearTimer();

        this.context.evalSync(getEventLoopCode());
    }

    clearAll() {
        for (const handle of this._pendingTimers.values()) {
            clearTimeout(handle);
        }

        this._pendingTimers.clear();

        try {
            this.context.evalSync("__timers_clearCallbacks()");
        } catch {}
    }

    dispose() {
        this._disposed = true;
        this.clearAll();

        try {
            this._registerTimeoutCallback.release();
        } catch {}

        try {
            this._registerIntervalCallback.release();
        } catch {}

        try {
            this._clearTimerCallback.release();
        } catch {}

        delete this.context;
    }

    _setupRegisterTimeout() {
        this._registerTimeoutCallback = new ivm.Callback(delay => {
            const id = this._nextTimerId++,
                normalizedDelay = Math.max(0, delay || 0);

            const handle = setTimeout(() => {
                if (this._disposed || !this._pendingTimers.has(id)) {
                    return;
                }

                this._pendingTimers.delete(id);

                try {
                    this.context.evalSync(`__timers_execute(${id}); __timers_removeCallback(${id})`);
                } catch {}
            }, normalizedDelay);

            this._pendingTimers.set(id, handle);
            return id;
        });

        this.context.global.setSync("__timers_registerTimeout", this._registerTimeoutCallback);
    }

    _setupRegisterInterval() {
        this._registerIntervalCallback = new ivm.Callback(delay => {
            const id = this._nextTimerId++,
                normalizedDelay = Math.max(0, delay || 0);

            const handle = setInterval(() => {
                if (this._disposed || !this._pendingTimers.has(id)) {
                    return;
                }

                try {
                    this.context.evalSync(`__timers_execute(${id})`);
                } catch {}
            }, normalizedDelay);

            this._pendingTimers.set(id, handle);
            return id;
        });

        this.context.global.setSync("__timers_registerInterval", this._registerIntervalCallback);
    }

    _setupClearTimer() {
        this._clearTimerCallback = new ivm.Callback(id => {
            const handle = this._pendingTimers.get(id);

            if (handle) {
                clearTimeout(handle);
                this._pendingTimers.delete(id);
            }
        });

        this.context.global.setSync("__timers_clear", this._clearTimerCallback);
    }
}

export default EventLoop;
