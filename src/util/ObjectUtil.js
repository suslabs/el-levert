import TypeTester from "./TypeTester.js";

import UtilError from "../errors/UtilError.js";

const ObjectUtil = Object.freeze({
    filterObject: (obj, f1, f2) => {
        f1 ??= key => true;
        f2 ??= value => true;

        const entries = Object.entries(obj),
            filtered = entries.filter(([key, value], i) => f1(key, i) && f2(value, i));

        return Object.fromEntries(filtered);
    },

    rewriteObject: (obj, f1, f2) => {
        f1 ??= key => key;
        f2 ??= value => value;

        const entries = Object.entries(obj),
            newEntries = entries.map(([key, value], i) => [f1(key, i), f2(value, i)]);

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
            if (source[key] == null) {
                let defaultValue = defaults[key];

                if (typeof defaultValue !== "function") {
                    defaultValue = structuredClone(defaultValue);
                }

                values[key] = defaultValue;
            }
        }

        return Object.assign(target, source, values);
    },

    assign: (target, source, options, props) => {
        switch (typeof options) {
            case "undefined":
                options = ["both"];
                break;
            case "string":
                options = [options];
                break;
        }

        let enumerable,
            nonEnumerable,
            both = options.includes("both");

        if (both) {
            enumerable = nonEnumerable = true;
        } else {
            enumerable = options.includes("enum");
            nonEnumerable = options.includes("nonenum");

            both = enumerable && nonEnumerable;
        }

        const keys = options.includes("keys");

        if ((!enumerable && !nonEnumerable && !both && !keys) || (both && keys)) {
            throw new UtilError("Invalid options: " + options.join(", "));
        }

        if (keys) {
            Object.assign(target, source);
        }

        const allDescriptors = Object.entries(Object.getOwnPropertyDescriptors(source));
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

    shallowClone: (obj, options) => {
        const clone = Object.create(Object.getPrototypeOf(obj));
        return ObjectUtil.assign(clone, obj, options);
    },

    wipeObject: (obj, callback) => {
        if (typeof callback === "undefined") {
            const keys = Object.keys(obj);

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                delete obj[key];
            }

            return keys.length;
        }

        const entries = Object.entries(obj);

        let length = entries.length,
            i = 0,
            n = 0;

        let ret,
            loopPromise = false;

        for (; i < length; i++) {
            const [key, item] = entries[i];
            ret = callback(key, item, i);

            if (TypeTester.isPromise(ret)) {
                loopPromise = true;
                i++;

                break;
            }

            const shouldDelete = ret ?? true;

            if (shouldDelete) {
                delete obj[key];
                n++;
            }
        }

        if (loopPromise) {
            return (async () => {
                ret = await ret;

                for (; i < length; i++) {
                    const [key, item] = entries[i];
                    await callback(key, item, i);

                    const shouldDelete = ret ?? true;

                    if (shouldDelete) {
                        delete obj[key];
                        n++;
                    }
                }

                return n;
            })();
        } else {
            return n;
        }
    }
});

export default ObjectUtil;
