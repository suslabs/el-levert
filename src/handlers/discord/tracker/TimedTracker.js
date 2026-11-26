import Tracker from "./Tracker.js";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

class TimedTracker extends Tracker {
    constructor(sweepInterval = 0, options) {
        options = ObjectUtil.guaranteeObject(options);
        super(true, { ...options, sweepInterval });
    }

    sweepItems() {
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
    }

    static _sweepFunc(itemName) {
        const cap = Util.capitalize(itemName);

        const func = function sweepItems() {
            return this.sweepItems();
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

    _onSweepError(err) {
        getLogger().error(`Error while sweeping ${this.constructor.itemName}s:`, err);
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
}

export default TimedTracker;
