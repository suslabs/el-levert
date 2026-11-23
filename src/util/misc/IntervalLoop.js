import TypeTester from "../TypeTester.js";

function throwError(err) {
    throw err;
}

class IntervalLoop {
    constructor(callback, interval, onError = throwError) {
        this.callback = callback;
        this.interval = interval;
        this.onError = onError;

        this._running = false;
        this._timer = null;
        this._task = null;
    }

    get running() {
        return this._running;
    }

    start() {
        if (this.running) {
            return;
        }

        this._running = true;

        if (this._task === null) {
            this._schedule();
        }
    }

    stop() {
        this._running = false;
        clearTimeout(this._timer);
        this._timer = null;

        if (this._task !== null) {
            return this._task;
        }
    }

    _schedule() {
        if (this.running && this._timer === null) {
            this._timer = setTimeout(() => this._run(), this.interval);
        }
    }

    _run() {
        this._timer = null;

        if (this._task !== null) {
            return;
        }

        let result;

        try {
            result = this.callback();
        } catch (err) {
            this.onError(err);
            this._schedule();
            return;
        }

        if (TypeTester.isPromise(result)) {
            this._task = this._runAsync(result);
        } else {
            this._schedule();
        }
    }

    async _runAsync(result) {
        try {
            await result;
        } catch (err) {
            this.onError(err);
        } finally {
            this._task = null;
            this._schedule();
        }
    }
}

export default IntervalLoop;
