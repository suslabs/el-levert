import Tracker from "./Tracker.js";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import IntervalLoop from "../../../util/misc/IntervalLoop.js";

class TimedTracker extends Tracker {
    constructor(sweepInterval = 0, options) {
        super(true, options);

        this.sweepInterval = sweepInterval;
        this.enableChecks = sweepInterval > 0;
        this.enableSweep = this.enableChecks;

        this._sweepLoop = new IntervalLoop(this._sweepItems, this.sweepInterval, err =>
            getLogger().error(`Error while sweeping ${this.constructor.itemName}s:`, err)
        );

        if (this.enableChecks) {
            this._sweepLoop.start();
        }
    }

    destroy() {
        const stopped = this._sweepLoop.stop();

        this.clearItems();
        return stopped;
    }

    static _sweepFunc(itemName) {
        const cap = Util.capitalize(itemName);

        const func = function sweepItems() {
            return this._sweepItems();
        };

        return {
            propName: `_sweep${cap}s`,
            desc: { value: func }
        };
    }

    static _registerItemFuncs() {
        super._registerItemFuncs();

        if (Util.nonemptyString(this.itemName)) {
            this._registerFunc(this._sweepFunc, this.itemName);
        }
    }

    _onExpire(item) {
        if (typeof item.destroy !== "function") {
            return;
        }

        const onError = err => getLogger().error(`Error while destroying expired ${this.constructor.itemName}:`, err);

        try {
            return Util.maybeAsyncThen(item.destroy(true), null, onError);
        } catch (err) {
            onError(err);
        }
    }

    _sweepItems = () => {
        const now = Date.now(),
            expired = [];

        for (const [id, item] of this.items.entries()) {
            const timeout = item.timeout ?? this.sweepInterval;

            if (timeout > 0) {
                const dt = Util.timeDelta(now, item.timestamp);

                if (dt > timeout) {
                    expired.push([id, item]);
                }
            }
        }

        return ArrayUtil.maybeAsyncForEach(expired, ([id, item]) => {
            this.removeItem(id);
            return this._onExpire(item);
        });
    };
}

export default TimedTracker;
