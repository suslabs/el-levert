import Util from "./Util.js";
import TypeTester from "./TypeTester.js";
import ArrayUtil from "./ArrayUtil.js";

import AssignPropertyTypes from "./AssignPropertyTypes.js";

import UtilError from "../errors/UtilError.js";

const ObjectUtil = Object.freeze({
    filterObject: (obj, keyFunc, valFunc) => {
        keyFunc ??= () => true;
        valFunc ??= () => true;

        const entries = Object.entries(obj),
            filtered = entries.filter(([key, value], i) => keyFunc(key, i) && valFunc(value, i));

        return Object.fromEntries(filtered);
    },

    rewriteObject: (obj, keyFunc, valFunc) => {
        keyFunc ??= key => key;
        valFunc ??= value => value;

        const entries = Object.entries(obj),
            newEntries = entries.map(([key, value], i) => [keyFunc(key, i), valFunc(value, i)]);

        return Object.fromEntries(newEntries);
    },

    removeUndefinedValues: obj => {
        return ObjectUtil.filterObject(obj, null, value => typeof value !== "undefined");
    },

    reverseObject: obj => {
        return Object.fromEntries(Object.entries(obj).map(([key, value]) => [value, key]));
    },

    guaranteeObject: (obj, fallback = {}, key = null) => {
        if (TypeTester.isObject(obj)) {
            return obj;
        }

        if (typeof fallback === "string") {
            key = fallback;
            fallback = {};
        }

        if (Util.nonemptyString(key) && obj != null) {
            return { [key]: obj };
        }

        return fallback;
    },

    _isGetterOnly: (obj, key) => {
        return (
            TypeTester.isObject(obj) &&
            typeof obj.__lookupGetter__ === "function" &&
            typeof obj.__lookupGetter__(key) === "function" &&
            typeof obj.__lookupSetter__(key) === "undefined"
        );
    },

    setValuesWithDefaults: (target, source, defaults = {}, filter = true) => {
        source = ObjectUtil.guaranteeObject(source);

        const isFiltered = key => {
            if (!filter) {
                return false;
            }

            return ObjectUtil._isGetterOnly(target, key) || (typeof filter === "function" && !filter(key));
        };

        if (filter) {
            source = ObjectUtil.filterObject(source, key => !isFiltered(key));
        }

        const values = {};

        for (const [key, defaultValue] of Object.entries(defaults)) {
            if (isFiltered(key)) {
                continue;
            }

            if (source[key] == null) {
                values[key] = typeof defaultValue === "function" ? defaultValue : structuredClone(defaultValue);
            }
        }

        return Object.assign(target, source, values);
    },

    getBooleanOptions: (options, defaults = {}, objectDefaults = defaults) => {
        if (typeof defaults === "boolean") {
            defaults = Object.fromEntries(Object.keys(objectDefaults).map(key => [key, defaults]));
        }

        if (typeof options === "boolean") {
            return Object.fromEntries(Object.keys(defaults).map(key => [key, options]));
        }

        return ObjectUtil.setValuesWithDefaults({}, ObjectUtil.guaranteeObject(options, defaults), objectDefaults);
    },

    assign: (target, source, options, props) => {
        let _enum, nonenum, both, keys;

        if (options == null) {
            options = [AssignPropertyTypes.both];
            both = true;
        } else {
            options = ArrayUtil.guaranteeArray(options).map(option =>
                TypeTester.normalizeEnum(option, AssignPropertyTypes, "property options", UtilError)
            );

            both = options.includes(AssignPropertyTypes.both);
            keys = options.includes(AssignPropertyTypes.keys);
        }

        if (Util.empty(options)) {
            throw new UtilError("Invalid property options", options);
        } else if (keys) {
            return Object.assign(target, source);
        } else if (both) {
            _enum = nonenum = true;
        } else {
            _enum = options.includes(AssignPropertyTypes.enum);
            nonenum = options.includes(AssignPropertyTypes.nonenum);

            both = _enum && nonenum;
        }

        const allDescriptors = (desc => Reflect.ownKeys(desc).map(key => [key, desc[key]]))(
            Object.getOwnPropertyDescriptors(source)
        );

        let descriptors = [];

        if (both) {
            descriptors = allDescriptors;
        } else {
            descriptors = allDescriptors.filter(([, desc]) => (_enum ? desc.enumerable : !desc.enumerable));
        }

        if (TypeTester.isObject(props)) {
            descriptors = descriptors.map(([key, desc]) => [key, { ...desc, ...props }]);
        }

        descriptors = Object.fromEntries(descriptors);
        Object.defineProperties(target, descriptors);

        return target;
    },

    shallowClone: (obj, options = AssignPropertyTypes.keys) => {
        if (Array.isArray(obj)) {
            return [...obj];
        }

        const clone = Object.create(Object.getPrototypeOf(obj));
        return ObjectUtil.assign(clone, obj, options);
    },

    defineProperty(obj, factory, ...args) {
        const props = ArrayUtil.guaranteeArray(factory(...args)).filter(Boolean);

        for (const prop of props) {
            let { propName, desc } = prop;

            if (!Util.nonemptyString(propName) || !TypeTester.isObject(desc)) {
                throw new UtilError("Invalid property recieved from factory", prop);
            }

            desc = ObjectUtil.shallowClone(desc);
            desc.enumerable ??= false;
            desc.configurable ??= false;

            if ([desc.get, desc.set].every(val => typeof val === "undefined")) {
                desc.writable ??= false;
            } else {
                delete desc.writable;
            }

            Object.defineProperty(obj, propName, desc);
        }
    },

    wipeObject: (obj, callback) => {
        if (typeof callback !== "function") {
            const keys = Object.keys(obj);
            keys.forEach(key => delete obj[key]);

            return keys.length;
        }

        const entries = Object.entries(obj),
            length = entries.length;

        let loopPromise = false;

        let n = 0,
            i = 0,
            j;

        let key, item, ret;

        const deleteItem = () => {
            if (ret ?? true) {
                delete obj[key];
                n++;
            }
        };

        for (; i < length; i++) {
            [key, item] = entries[i];
            ret = callback(key, item, i);

            if (TypeTester.isPromise(ret)) {
                loopPromise = true;
                j = i;

                break;
            }

            deleteItem();
        }

        if (loopPromise) {
            return (async () => {
                for (; j < length; j++) {
                    [key, item] = entries[j];

                    ret = await (j === i ? ret : callback(key, item, j));
                    deleteItem();
                }

                return n;
            })();
        } else {
            return n;
        }
    }
});

export default ObjectUtil;
