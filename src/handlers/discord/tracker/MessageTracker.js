import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import { getLogger } from "../../../LevertClient.js";

import HandlerError from "../../../errors/HandlerError.js";

class MessageTracker {
    static listNames = {};

    constructor(trackLimit = 50) {
        if (!this.constructor._ready) {
            throw new HandlerError("Tracker static initializer hasn't been run");
        }

        this.trackLimit = trackLimit;
        this.enableTracking = trackLimit > 0;

        if (this.enableTracking) {
            this.trackedMsgs = new Map();
        }
    }

    getData(triggerMsg) {
        const triggerId = MessageTracker._getTriggerId(triggerMsg);

        const data = this._getData(triggerId);
        return data ?? this.constructor._emptyData;
    }

    deleteData(triggerMsg) {
        const triggerId = MessageTracker._getTriggerId(triggerMsg);

        if (!this.enableTracking || triggerId == null) {
            return false;
        }

        return this.trackedMsgs.delete(triggerId);
    }

    async deleteWithCallback(triggerMsg, itemName, callback) {
        const funcName = `delete${Util.capitalize(itemName)}`,
            items = this[funcName](triggerMsg);

        if (items === null) {
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

    clearTrackedMsgs() {
        if (!this.enableTracking) {
            return false;
        }

        this.trackedMsgs.clear();
        return true;
    }

    static _ready = false;

    static _createData(triggerId) {
        return {
            trigger: triggerId,
            ...Object.fromEntries(this._listProps.map(prop => [prop, []]))
        };
    }

    static _dataEmpty(data) {
        if (data == null) {
            return true;
        }

        return data.trigger === null || this._listProps.every(prop => Util.empty(data[prop]));
    }

    _getData(triggerId) {
        if (this.enableTracking && triggerId != null) {
            return this.trackedMsgs.get(triggerId);
        }
    }

    _pruneOldData() {
        if (this.trackedMsgs.size >= this.trackLimit) {
            const oldest = this.trackedMsgs.keys().next().value;
            this.trackedMsgs.delete(oldest);
        }
    }

    _getOrCreate(triggerId) {
        let data = this._getData(triggerId);

        if (typeof data !== "undefined") {
            return data;
        }

        data = this.constructor._createData(triggerId);

        this._pruneOldData();
        this.trackedMsgs.set(triggerId, data);

        return data;
    }

    _addItem(triggerId, listName, item) {
        const data = this._getOrCreate(triggerId),
            list = data[listName];

        if (Array.isArray(item)) {
            const items = item;
            list.push(...items);
        } else {
            list.push(item);
        }
    }

    _editItem(triggerId, listName, oldItem, newItem) {
        const data = this._getData(triggerId),
            list = data?.[listName];

        if (typeof list === "undefined") {
            return null;
        }

        if (Array.isArray(newItem)) {
            const newItems = newItem,
                oldItems = list;

            data[listName] = newItems;
            return [oldItems, data];
        } else {
            const idx = ArrayUtil._indexFunc(list, oldItem);

            if (idx < 0 || idx >= list.length) {
                return null;
            }

            oldItem = list[idx];
            list[idx] = newItem;

            return oldItem;
        }
    }

    _deleteItem(triggerId, listName, item) {
        const data = this._getData(triggerId),
            list = data?.[listName];

        if (typeof list === "undefined") {
            return null;
        }

        if (item == null) {
            const oldList = list;
            data[listName] = [];

            return [oldList, data];
        } else {
            item = ArrayUtil.removeItem(list, item)[1];
            return [item, data];
        }
    }

    static _getTriggerId(triggerMsg) {
        if (TypeTester.isObject(triggerMsg)) {
            return triggerMsg.id ?? triggerMsg;
        } else {
            return triggerMsg;
        }
    }

    static _addItemFunc(listName, itemName) {
        const funcName = `add${Util.capitalize(itemName)}`,
            func = function addItem(triggerMsg, item) {
                const triggerId = MessageTracker._getTriggerId(triggerMsg);

                if (!this.enableTracking || triggerId == null) {
                    return false;
                }

                this._addItem(triggerId, listName, item);
                return true;
            };

        return {
            propName: funcName,
            desc: { value: func }
        };
    }

    static _editItemFunc(listName, itemName) {
        const funcName = `edit${Util.capitalize(itemName)}`,
            func = function editItem(triggerMsg, oldItem, newItem) {
                const triggerId = MessageTracker._getTriggerId(triggerMsg);

                if (!this.enableTracking || triggerId == null) {
                    return null;
                }

                const res = this._editItem(triggerId, listName, oldItem, newItem);

                if (res === null) {
                    return null;
                }

                if (Array.isArray(res)) {
                    let data;
                    [oldItem, data] = res;

                    if (this.constructor._dataEmpty(data)) {
                        this.trackedMsgs.delete(triggerId);
                    }
                } else {
                    oldItem = res;
                }

                return oldItem ?? null;
            };

        return {
            propName: funcName,
            desc: { value: func }
        };
    }

    static _deleteItemFunc(listName, itemName) {
        const funcName = `delete${Util.capitalize(itemName)}`,
            func = function deleteItem(triggerMsg, item) {
                const triggerId = MessageTracker._getTriggerId(triggerMsg);

                if (!this.enableTracking || triggerId == null) {
                    return null;
                }

                const res = this._deleteItem(triggerId, listName, item);

                if (res === null) {
                    return null;
                }

                let data;
                [item, data] = res;

                if (this.constructor._dataEmpty(data)) {
                    this.trackedMsgs.delete(triggerId);
                }

                return item ?? null;
            };

        return {
            propName: funcName,
            desc: { value: func }
        };
    }

    static _registerFunc(factory, ...args) {
        ObjectUtil.defineProperty(this.prototype, factory, ...args);
    }

    static _registerListFuncs() {
        for (const [itemName, listName] of Object.entries(this.listNames)) {
            this._registerFunc(this._addItemFunc, listName, itemName);
            this._registerFunc(this._editItemFunc, listName, itemName);
            this._registerFunc(this._deleteItemFunc, listName, itemName);
        }
    }

    static _init() {
        this._listProps = Object.values(this.listNames);
        this._emptyData = Object.freeze(this._createData(null));

        this._registerListFuncs();

        this._ready = true;
    }
}

export default MessageTracker;
