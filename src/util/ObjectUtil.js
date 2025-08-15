import Util from "./Util.js";
import TypeTester from "./TypeTester.js";

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
        return Object.fromEntriesObject.fromEntries(Object.entries(obj).map(([key, value]) => [value, key]));
    },

    setValuesWithDefaults: (target, source, defaults = {}) => {
        source = TypeTester.isObject(source) ? source : {};
        const values = {};

        for (const key of Object.keys(defaults)) {
            if (source[key] != null) {
                continue;
            }

            let defaultValue = defaults[key];

            if (typeof defaultValue !== "function") {
                defaultValue = structuredClone(defaultValue);
            }

            values[key] = defaultValue;
        }

        return Object.assign(target, source, values);
    },

    _validPropOptions: ["both", "enum", "nonenum", "keys"],
    assign: (target, source, options, props) => {
        let enumerable, nonEnumerable, both, keys;

        if (options == null) {
            options = ObjectUtil._validPropOptions[0];
            both = true;
        } else {
            if (!Array.isArray(options)) {
                options = [options];
            }

            if (!options.every(option => ObjectUtil._validPropOptions.includes(option))) {
                throw new UtilError("Invalid property options");
            }

            both = options.includes("both");
            keys = options.includes("keys");
        }

        if (options.length < 1) {
            throw new UtilError("Invalid property options");
        } else if (keys) {
            return Object.assign(target, source);
        } else if (both) {
            enumerable = nonEnumerable = true;
        } else {
            enumerable = options.includes("enum");
            nonEnumerable = options.includes("nonenum");

            both = enumerable && nonEnumerable;
        }

        const allDescriptors = (desc => Reflect.ownKeys(desc).map(key => [key, desc[key]]))(
            Object.getOwnPropertyDescriptors(source)
        );

        let descriptors;

        if (both) {
            descriptors = allDescriptors;
        } else if (enumerable) {
            descriptors = allDescriptors.filter(([, desc]) => desc.enumerable);
        } else if (nonEnumerable) {
            descriptors = allDescriptors.filter(([, desc]) => !desc.enumerable);
        }

        if (TypeTester.isObject(props)) {
            descriptors = descriptors.map(([key, desc]) => [key, { ...desc, ...props }]);
        }

        descriptors = Object.fromEntries(descriptors);

        Object.defineProperties(target, descriptors);
        return target;
    },

    shallowClone: (obj, options = "keys") => {
        const clone = Object.create(Object.getPrototypeOf(obj));
        return ObjectUtil.assign(clone, obj, options);
    },

    defineProperty(obj, factory, ...args) {
        const props = [].concat(factory(...args)).filter(Boolean);

        for (const prop of props) {
            let { propName, desc } = prop;

            if (typeof propName !== "string" || Util.empty(propName) || !TypeTester.isObject(desc)) {
                throw new UtilError("Invalid property recieved from factory");
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

                    if (j === i) {
                        ret = await ret;
                    } else {
                        ret = await callback(key, item, j);
                    }

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
