import Tracker from "./Tracker.js";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";

class TimedTracker extends Tracker {
    constructor(sweepInterval = 0, options) {
        super(true, options);

        this.sweepInterval = sweepInterval;
        this.enableChecks = sweepInterval > 0;
        this.enableSweep = this.enableChecks;

        this._sweepTimer = null;

        if (this.enableChecks) {
            this._startSweepLoop();
        }
    }

    destroy() {
        this._stopSweepLoop();
        this.clearItems();
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

    async _onExpire(item) {
        if (typeof item?.destroy === "function") {
            try {
                await item.destroy(true);
            } catch (err) {
                getLogger().error(`Error while destroying expired ${this.constructor.itemName}:`, err);
            }
        }
    }

    _sweepItems = async () => {
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

        for (const [id, item] of expired) {
            this.removeItem(id);
            await this._onExpire(item);
        }
    };

    _startSweepLoop() {
        if (this._sweepTimer !== null) {
            this._stopSweepLoop();
        }

        this._sweepTimer = setInterval(this._sweepItems, this.sweepInterval);
    }

    _stopSweepLoop() {
        if (this._sweepTimer === null) {
            return;
        }

        clearInterval(this._sweepTimer);
        this._sweepTimer = null;
    }
}

export default TimedTracker;
