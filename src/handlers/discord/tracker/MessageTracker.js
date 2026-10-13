import Tracker from "./Tracker.js";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";

class MessageTracker extends Tracker {
    static listNames = {};

    constructor(trackLimit = 50) {
        super(trackLimit > 0, { trackLimit });

        this.trackLimit = trackLimit;
    }

    async deleteWithCallback(triggerMsg, itemName, callback) {
        const funcName = `delete${Util.capitalize(itemName)}`,
            items = this[funcName](triggerMsg);

        if (items == null) {
            return false;
        }

        const triggerId = MessageTracker._getTriggerId(triggerMsg);

        if (Util.single(items)) {
            const item = Util.first(items);

            try {
                await callback(item);
            } catch (err) {
                getLogger().error(`Could not delete ${itemName} for message: ${triggerId}`, err);
            }
        } else {
            await Promise.all(
                items.map(item =>
                    Promise.resolve(callback(item)).catch(err => {
                        const listName = this.constructor.listNames[itemName];
                        getLogger().error(`Could not delete ${listName} for message: ${triggerId}`, err);
                    })
                )
            );
        }

        return true;
    }

    static _getTriggerId(triggerMsg) {
        return this._getId(triggerMsg);
    }

    _pruneOldData() {
        if (this.items.size >= this.trackLimit) {
            const oldest = this.items.keys().next().value;
            this.items.delete(oldest);
        }
    }

    _getOrCreate(triggerId) {
        let data = this._getData(triggerId);

        if (typeof data !== "undefined") {
            return data;
        }

        data = this.constructor._createData(triggerId);

        this._pruneOldData();
        this.items.set(triggerId, data);

        return data;
    }
}

export default MessageTracker;
