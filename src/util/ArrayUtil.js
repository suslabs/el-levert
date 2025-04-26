import Util from "./Util.js";
import TypeTester from "./TypeTester.js";

import UtilError from "../errors/UtilError.js";

const ArrayUtil = Object.freeze({
    frequency: (array, callback) => {
        const getValue = ArrayUtil._valueFunc(callback),
            map = new Map();

        for (const item of array) {
            const val = getValue(item);
            map.set(val, (map.get(val) || 0) + 1);
        }

        return map;
    },

    sameElements(arr1, arr2, strict = true, callback) {
        if (arr1.length !== arr2.length) {
            return false;
        }

        if (strict) {
            const getValue = ArrayUtil._valueFunc(callback);

            return arr1.every((a, i) => {
                const b = arr2[i];
                return getValue(a) === getValue(b);
            });
        }

        const aFreq = ArrayUtil.frequency(arr1, callback),
            bFreq = ArrayUtil.frequency(arr2, callback);

        if (aFreq.size !== bFreq.size) {
            return false;
        }

        for (const [val, count] of aFreq) {
            if (bFreq.get(val) !== count) {
                return false;
            }
        }

        return true;
    },

    concat: (a, ...args) => {
        const concatenated = [].concat(a, ...args);

        if (Array.isArray(a)) {
            return concatenated;
        } else {
            return concatenated.join("");
        }
    },

    split: (array, callback) => {
        return array.reduce(
            (acc, item, i) => {
                if (callback(item, i)) {
                    acc[0].push(item);
                } else {
                    acc[1].push(item);
                }

                return acc;
            },
            [[], []]
        );
    },

    zip: (arr1, arr2) => {
        const len = Math.min(arr1.length, arr2.length);
        return Array.from({ length: len }, (_, i) => [arr1[i], arr2[i]]);
    },

    sort: (array, callback) => {
        const getValue = ArrayUtil._valueFunc(callback);

        return array.sort((a, b) => {
            const a_val = getValue(a),
                b_val = getValue(b);

            if (typeof a_val === "number" && typeof b_val === "number") {
                return a_val - b_val;
            }

            return a_val.localeCompare(b_val, undefined, {
                numeric: true,
                sensitivity: "base"
            });
        });
    },

    unique: (array, callback) => {
        const getValue = ArrayUtil._valueFunc(callback),
            seen = new Set();

        return array.filter(item => {
            const val = getValue(item);

            if (seen.has(val)) {
                return false;
            }

            seen.add(val);
            return true;
        });
    },

    maxLength: (arr, length = "string") => {
        let lengthFunc;

        switch (length) {
            case "array":
                lengthFunc = Util.length;
                break;
            case "string":
                lengthFunc = Util.stringLength;
                break;
            default:
                throw new UtilError("Invalid length function: " + length);
        }

        return Math.max(...arr.map(x => lengthFunc(x)));
    },

    removeItem: (array, item, callback) => {
        let ind;

        switch (typeof item) {
            case "number":
                ind = item;
                break;
            case "function":
                const pred = item;
                ind = array.findIndex(pred);
                break;
            default:
                ind = array.indexOf(item);
                break;
        }

        if (ind < 0 || ind >= array.length) {
            return [false, undefined];
        }

        const getRemoved = () => array.splice(ind, 1)[0];

        if (typeof callback !== "function") {
            return [true, getRemoved()];
        }

        const ret = callback(ind, array);

        if (TypeTester.isPromise(ret)) {
            return ret.then(shouldDelete => {
                return shouldDelete ? [true, getRemoved()] : [false, undefined];
            });
        } else {
            return ret ? [true, getRemoved()] : [false, undefined];
        }
    },

    maybeAsyncForEach: (array, callback) => {
        let length = array.length,
            i = 0;

        let ret,
            loopPromise = false;

        for (; i < length; i++) {
            const item = array[i];
            ret = callback(item, i);

            if (TypeTester.isPromise(ret)) {
                loopPromise = true;
                i++;

                break;
            }
        }

        if (loopPromise) {
            return (async () => {
                ret = await ret;

                for (; i < length; i++) {
                    const item = array[i];
                    await callback(item, i);
                }
            })();
        }
    },

    wipeArray: (array, callback) => {
        const length = array.length;

        if (typeof callback !== "function") {
            array.length = 0;
            return length;
        }

        let loopPromise = false;

        let i = 0,
            j,
            n = 0;

        const keep = [],
            wipeAndPush = () => {
                array.length = 0;
                array.push(...keep);
            };

        let item, ret;

        const deleteItem = () => {
            if (ret ?? true) {
                n++;
            } else {
                keep.push(item);
            }
        };

        for (; i < length; i++) {
            item = array[i];
            ret = callback(item, i);

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
                    item = array[j];

                    if (j === i) {
                        ret = await ret;
                    } else {
                        ret = await callback(item, j);
                    }

                    deleteItem();
                }

                wipeAndPush();
                return n;
            })();
        } else {
            wipeAndPush();
            return n;
        }
    },

    _valueFunc: callback => {
        switch (typeof callback) {
            case "string":
                const propName = callback;
                return obj => obj[propName];
            case "function":
                return callback;
            default:
                return val => val;
        }
    }
});

export default ArrayUtil;
