import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import HandlerError from "../../../errors/HandlerError.js";

class Tracker {
    static itemName = "";
    static listNames = {};

    constructor(enabled = true, options) {
        if (!this.constructor._ready) {
            throw new HandlerError("Tracker static initializer hasn't been run");
        }

        this.enabled = enabled;
        this.enableTracking = enabled;

        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        this.items = new Map();
    }

    findItem(id) {
        id = this.constructor._getId(id);

        if (!this.enableTracking || id == null) {
            return null;
        }

        const item = this.items.get(id);
        return item ?? null;
    }

    getItem(id) {
        return this.findItem(id);
    }

    hasItem(id) {
        return this.findItem(id) !== null;
    }

    addItem(item) {
        const id = this.constructor._getId(item);

        if (!this.enableTracking || id == null) {
            return false;
        }

        item = this.constructor._createItem(item);
        this.items.set(id, item);

        return true;
    }

    removeItem(id) {
        const item = this.findItem(id);

        if (item === null) {
            return null;
        }

        const targetId = this.constructor._getId(id);
        this.items.delete(targetId);

        return item;
    }

    clearItems() {
        if (!this.enableTracking) {
            return false;
        }

        this.items.clear();
        return true;
    }

    withItem(id, callback) {
        if (typeof callback !== "function") {
            throw new HandlerError("Callback function required");
        }

        const itemName = this.constructor.itemName || "item";

        if (this.hasItem(id)) {
            throw new HandlerError(`${Util.capitalize(itemName)} already exists`, id);
        } else if (!this.addItem(id)) {
            return;
        }

        let res = null;

        try {
            res = callback();
        } catch (err) {
            this.removeItem(id);
            throw err;
        }

        if (TypeTester.isPromise(res)) {
            return res.finally(() => this.removeItem(id));
        } else {
            this.removeItem(id);
            return res;
        }
    }

    getData(triggerMsg) {
        const triggerId = this.constructor._getId(triggerMsg);

        const data = this._getData(triggerId);
        return data ?? this.constructor._emptyData;
    }

    deleteData(triggerMsg) {
        const triggerId = this.constructor._getId(triggerMsg);

        if (!this.enableTracking || triggerId == null) {
            return false;
        }

        return this.items.delete(triggerId);
    }

    clearTrackedMsgs() {
        if (!this.enableTracking) {
            return false;
        }

        this.items.clear();
        return true;
    }

    static _ready = false;

    static _getId(target) {
        if (TypeTester.isObject(target)) {
            return target.id ?? target;
        } else {
            return target;
        }
    }

    static _createItem(item) {
        if (TypeTester.isObject(item)) {
            item.timestamp ??= Date.now();
            return item;
        }

        return {
            id: item,
            timestamp: Date.now()
        };
    }

    static _createData(triggerId) {
        return {
            trigger: triggerId,
            ...Object.fromEntries((this._listProps ?? []).map(prop => [prop, []]))
        };
    }

    static _dataEmpty(data) {
        if (data == null) {
            return true;
        }

        return data.trigger === null || (this._listProps ?? []).every(prop => Util.empty(data[prop]));
    }

    static _findFunc(itemName) {
        const cap = Util.capitalize(itemName),
            func = function findItem(id) {
                return this.findItem(id);
            };

        return [
            {
                propName: `find${cap}`,
                desc: { value: func }
            },
            {
                propName: `get${cap}`,
                desc: { value: func }
            }
        ];
    }

    static _hasFunc(itemName) {
        const cap = Util.capitalize(itemName),
            func = function hasItem(id) {
                return this.hasItem(id);
            };

        return {
            propName: `has${cap}`,
            desc: { value: func }
        };
    }

    static _addFunc(itemName) {
        const cap = Util.capitalize(itemName),
            func = function addItem(item) {
                return this.addItem(item);
            };

        return {
            propName: `add${cap}`,
            desc: { value: func }
        };
    }

    static _removeFunc(itemName) {
        const cap = Util.capitalize(itemName),
            func = function removeItem(id) {
                return this.removeItem(id);
            };

        return {
            propName: `remove${cap}`,
            desc: { value: func }
        };
    }

    static _clearFunc(itemName) {
        const cap = Util.capitalize(itemName),
            func = function clearItems() {
                return this.clearItems();
            };

        return {
            propName: `clear${cap}s`,
            desc: { value: func }
        };
    }

    static _withFunc(itemName) {
        const cap = Util.capitalize(itemName),
            func = function withItem(id, callback) {
                return this.withItem(id, callback);
            };

        return {
            propName: `with${cap}`,
            desc: { value: func }
        };
    }

    static _addItemFunc(listName, itemName) {
        const funcName = `add${Util.capitalize(itemName)}`,
            func = function addItem(triggerMsg, item) {
                const triggerId = this.constructor._getId(triggerMsg);

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
                const triggerId = this.constructor._getId(triggerMsg);

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
                        this.items.delete(triggerId);
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
                const triggerId = this.constructor._getId(triggerMsg);

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
                    this.items.delete(triggerId);
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

    static _registerItemFuncs() {
        if (!Util.nonemptyString(this.itemName)) {
            return;
        }

        this._registerFunc(this._findFunc, this.itemName);
        this._registerFunc(this._hasFunc, this.itemName);
        this._registerFunc(this._addFunc, this.itemName);
        this._registerFunc(this._removeFunc, this.itemName);
        this._registerFunc(this._clearFunc, this.itemName);
        this._registerFunc(this._withFunc, this.itemName);
    }

    static _registerListFuncs() {
        if (!TypeTester.isObject(this.listNames)) {
            return;
        }

        for (const [itemName, listName] of Object.entries(this.listNames)) {
            this._registerFunc(this._addItemFunc, listName, itemName);
            this._registerFunc(this._editItemFunc, listName, itemName);
            this._registerFunc(this._deleteItemFunc, listName, itemName);
        }
    }

    static _init() {
        if (TypeTester.isObject(this.listNames)) {
            this._listProps = Object.values(this.listNames);
            this._emptyData = Object.freeze(this._createData(null));

            this._registerListFuncs();
        }

        this._registerItemFuncs();

        this._ready = true;
    }

    _getData(triggerId) {
        if (this.enableTracking && triggerId != null) {
            return this.items.get(triggerId);
        }
    }

    _getOrCreate(triggerId) {
        let data = this._getData(triggerId);

        if (typeof data !== "undefined") {
            return data;
        }

        data = this.constructor._createData(triggerId);
        this.items.set(triggerId, data);

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
}

export default Tracker;
