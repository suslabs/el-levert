import Util from "./Util.js";
import TypeTester from "./TypeTester.js";

import LengthTypes from "./LengthTypes.js";

const ArrayUtil = Object.freeze({
    withLength: (length, callback) => {
        return Array.from({ length }, (_, i) => callback(i));
    },

    guaranteeArray: (obj, length) => {
        if (typeof length !== "number") {
            return Array.isArray(obj) ? obj : [obj];
        }

        return Array.isArray(obj)
            ? obj.concat(new Array(Util.clamp(length - obj.length, 0)).fill())
            : new Array(length).fill(obj);
    },

    guaranteeFirst: obj => {
        return Array.isArray(obj) ? obj[0] : obj;
    },

    sum: (array, callback) => {
        const getValue = ArrayUtil._valueFunc(callback);
        return array.reduce((total, item) => total + getValue(item), 0);
    },

    concat: (array, ...args) => {
        return Array.isArray(array) ? array.concat(...args) : [array, ...args].join("");
    },

    frequency: (array, callback) => {
        const getValue = ArrayUtil._valueFunc(callback);

        return array.reduce((map, item) => {
            const val = getValue(item);
            map.set(val, (map.get(val) || 0) + 1);

            return map;
        }, new Map());
    },

    unique: (array, callback) => {
        const getValue = ArrayUtil._valueFunc(callback),
            seen = new Set();

        return array.filter(item => {
            const val = getValue(item);

            if (seen.has(val)) {
                return false;
            } else {
                seen.add(val);
                return true;
            }
        });
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

    split: (array, callback) => {
        return array.reduce(
            (acc, item, i) => {
                const idx = Number(callback(item, i));

                while (acc.length <= idx) {
                    acc.push([]);
                }

                acc[idx].push(item);
                return acc;
            },
            [[], []]
        );
    },

    zip: (arr1, arr2) => {
        const len = Math.min(arr1.length, arr2.length);
        return Array.from({ length: len }, (_, i) => [arr1[i], arr2[i]]);
    },

    removeItem: (array, item, callback) => {
        const idx = ArrayUtil._indexFunc(array, item);

        if (idx < 0 || idx >= array.length) {
            return [false, undefined];
        }

        const getRemoved = () => array.splice(idx, 1)[0];

        if (typeof callback !== "function") {
            return [true, getRemoved()];
        }

        return Util.maybeAsyncThen(callback(idx, array), shouldDelete =>
            shouldDelete ? [true, getRemoved()] : [false, undefined]
        );
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

                    ret = await (j === i ? ret : callback(item, j));
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

    maxLength: (array, lengthType = LengthTypes.string) => {
        return Math.max(...array.map(x => Util.getLength(x, lengthType)));
    },

    _indexFunc: (array, item) => {
        switch (typeof item) {
            case "number":
                return item;
            case "function":
                const callback = item;
                return array.findIndex(callback);
            default:
                return array.indexOf(item);
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
