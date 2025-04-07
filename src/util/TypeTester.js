import Util from "./Util.js";
import DiscordUtil from "./DiscordUtil.js";

import UtilError from "../errors/UtilError.js";

const TypeTester = Object.freeze({
    isObject: obj => {
        return obj !== null && typeof obj === "object";
    },

    isClass: obj => {
        if (typeof obj !== "function") {
            return false;
        }

        if (obj.toString().startsWith("class")) {
            return true;
        }

        return Object.getOwnPropertyNames(obj.prototype).length > 1;
    },

    isPromise: obj => {
        return typeof obj?.then === "function";
    },

    className: obj => {
        if (obj == null) {
            return "";
        } else if (typeof obj === "function") {
            obj = obj.prototype;
        }

        return obj.constructor.name;
    },

    outOfRange(propName, min, max, ...args) {
        const hasPropName = typeof propName === "string",
            getProp = hasPropName ? obj => obj[propName] : obj => obj;

        if (!hasPropName) {
            args = [max].concat(args);

            max = min;
            min = propName;
        }

        const check = val => {
            if (val === null) {
                return false;
            }

            return Number.isNaN(val) || val < min || val > max;
        };

        if (args.length === 1) {
            const obj = args[0];
            return check(getProp(obj));
        }

        return args.find(obj => check(getProp(obj)));
    },

    overSizeLimits: (obj, charLimit, lineLimit) => {
        if (obj == null) {
            return false;
        }

        if (typeof charLimit === "number") {
            const count =
                typeof obj === "string"
                    ? Util.countChars(obj)
                    : DiscordUtil.getEmbedSize(obj, {
                          count: "chars"
                      });

            if (count > charLimit) {
                return [count, null];
            }
        }

        if (typeof lineLimit === "number") {
            const count =
                typeof obj === "string"
                    ? Util.countLines(obj)
                    : DiscordUtil.getEmbedSize(obj, {
                          count: "lines"
                      });

            if (count > lineLimit) {
                return [null, count];
            }
        }

        return false;
    },

    _validProp: (obj, expected) => {
        if (typeof expected === "string") {
            if (expected === "object") {
                return TypeTester.isObject(obj);
            } else {
                return typeof obj === expected;
            }
        }

        if (typeof expected === "function") {
            return obj instanceof expected;
        }

        if (TypeTester.isObject(expected)) {
            if (TypeTester.isObject(obj)) {
                return TypeTester.validateProps(obj, expected);
            } else {
                return false;
            }
        }

        throw new UtilError("Invalid expected type");
    },
    validateProps: (obj, requiredProps) => {
        for (const [name, expected] of Object.entries(requiredProps)) {
            const prop = obj[name];

            if (!TypeTester._validProp(prop, expected)) {
                return false;
            }
        }

        return true;
    }
});

export default TypeTester;
