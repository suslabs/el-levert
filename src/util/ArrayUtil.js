import Util from "./Util.js";
import TypeTester from "./TypeTester.js";

import UtilError from "../errors/UtilError.js";

const ArrayUtil = Object.freeze({
    concat: (a, ...args) => {
        const concatenated = [].concat(a, ...args);

        if (Array.isArray(a)) {
            return concatenated;
        }

        return concatenated.join("");
    },

    split: (arr, callback) => {
        return arr.reduce(
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
        const useCallback = typeof callback === "function";

        return array.sort((a, b) => {
            const a_val = useCallback ? callback(a) : a,
                b_val = useCallback ? callback(b) : b;

            return a_val.localeCompare(b_val, "en", {
                numeric: true,
                sensitivity: "base"
            });
        });
    },

    unique: (array, propName) => {
        const hasPropName = typeof propName === "string",
            getProp = hasPropName ? obj => obj[propName] : obj => obj;

        const seen = new Set();

        return array.filter(item => {
            const val = getProp(item);

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

        if (typeof item === "function") {
            ind = array.findIndex(item);
        } else {
            ind = array.indexOf(item);
        }

        if (ind === -1) {
            return false;
        }

        if (typeof callback === "undefined") {
            delete array[ind];
            array.splice(ind, 1);

            return true;
        }

        const ret = callback(ind, array);

        if (TypeTester.isPromise(ret)) {
            return ret.then(_ => true);
        } else {
            delete array[ind];
            array.splice(ind, 1);

            return true;
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
        let length = array.length,
            i = 0;

        if (typeof callback === "undefined") {
            for (let i = 0; i < length; i++) {
                delete array[i];
            }

            array.length = 0;
            return length;
        }

        let n = 0;

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

            const shouldDelete = ret ?? true;

            if (shouldDelete) {
                delete array[i];
                n++;
            }
        }

        if (loopPromise) {
            return (async () => {
                ret = await ret;

                for (; i < length; i++) {
                    const item = array[i];
                    await callback(item, i);

                    const shouldDelete = ret ?? true;

                    if (shouldDelete) {
                        delete array[i];
                        n++;
                    }
                }

                array.length = 0;
                return n;
            })();
        } else {
            array.length = 0;
            return n;
        }
    }
});

export default ArrayUtil;
