import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

class MessageTracker {
    constructor(trackLimit = 100) {
        this.trackLimit = trackLimit;
        this.enableTracking = trackLimit > 0;

        if (this.enableTracking) {
            this.trackedMsgs = new Map();
        }
    }

    getData(triggerId) {
        triggerId = MessageTracker._getTriggerId(triggerId);

        const data = this._getData(triggerId);
        return data ?? this.constructor._emptyData;
    }

    deleteData(triggerId) {
        triggerId = MessageTracker._getTriggerId(triggerId);

        if (!this.enableTracking || triggerId == null) {
            return false;
        }

        return this.trackedMsgs.delete(triggerId);
    }

    clearMsgs() {
        if (!this.enableTracking) {
            return false;
        }

        this.trackedMsgs.clear();
        return true;
    }

    static _listProps = ["replies"];

    static _itemNames = {
        replies: "reply"
    };

    static _createData(triggerId) {
        return {
            triggerId,
            ...Object.fromEntries(this._listProps.map(prop => [prop, []]))
        };
    }

    static _emptyData = Object.freeze(this._createData(null));

    static _dataEmpty(data) {
        if (data == null) {
            return true;
        }

        return data.triggerId === null || this._listProps.every(prop => Util.empty(data[prop]));
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

        data = MessageTracker._createData(triggerId);

        this._pruneOldData();
        this.trackedMsgs.set(triggerId, data);

        return data;
    }

    _addItem(triggerId, listName, item) {
        const data = this._getOrCreate(triggerId),
            list = data[listName];

        if (Array.isArray(item)) {
            list.push(...item);
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
            const oldList = list;
            data[listName] = newItem;

            return [oldList, data];
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

    static _getTriggerId(triggerId) {
        return TypeTester.isObject(triggerId) ? triggerId.id : triggerId;
    }

    static _addItemFunc(listName, itemName) {
        const funcName = `add${Util.capitalize(itemName)}`,
            func = function addItem(triggerId, item) {
                triggerId = MessageTracker._getTriggerId(triggerId);

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
            func = function editItem(triggerId, oldItem, newItem) {
                triggerId = MessageTracker._getTriggerId(triggerId);

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

                    if (MessageTracker._dataEmpty(data)) {
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
            func = function deleteItem(triggerId, item) {
                triggerId = MessageTracker._getTriggerId(triggerId);

                if (!this.enableTracking || triggerId == null) {
                    return null;
                }

                const res = this._deleteItem(triggerId, listName, item);

                if (res === null) {
                    return null;
                }

                let data;
                [item, data] = res;

                if (MessageTracker._dataEmpty(data)) {
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
        for (const listName of this._listProps) {
            const itemName = this._itemNames[listName];

            this._registerFunc(this._addItemFunc, listName, itemName);
            this._registerFunc(this._editItemFunc, listName, itemName);
            this._registerFunc(this._deleteItemFunc, listName, itemName);
        }
    }

    static {
        this._registerListFuncs();
    }
}

export default MessageTracker;
