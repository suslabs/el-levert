import UtilError from "../errors/UtilError.js";

const TypeTester = Object.freeze({
    isObject: obj => {
        return obj !== null && typeof obj === "object";
    },

    isArray: arr => {
        return Array.isArray(arr) || ArrayBuffer.isView(arr);
    },

    isClass: obj => {
        if (typeof obj !== "function") {
            return false;
        } else if (obj.toString().startsWith("class")) {
            return true;
        } else {
            return Object.getOwnPropertyNames(obj.prototype).length > 1;
        }
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

    charType: char => {
        if (char?.length !== 1) {
            return "invalid";
        }

        const code = char.charCodeAt(0);

        if (code === 32) {
            return "space";
        } else if (code >= 48 && code <= 57) {
            return "number";
        } else if (code >= 65 && code <= 90) {
            return "uppercase";
        } else if (code >= 97 && code <= 122) {
            return "lowercase";
        } else {
            return "other";
        }
    },

    isInRange: (value, range) => {
        return range.some(([first, last]) => value >= first && value <= last);
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
        } else {
            return args.find(obj => check(getProp(obj)));
        }
    },

    _validProp: (obj, expected) => {
        if (typeof expected === "string") {
            return expected === "object" ? TypeTester.isObject(obj) : typeof obj === expected;
        } else if (typeof expected === "function") {
            return obj instanceof expected;
        } else if (TypeTester.isObject(expected)) {
            return TypeTester.validateProps(obj, expected);
        } else {
            throw new UtilError("Invalid expected type provided", expected);
        }
    },
    validateProps: (obj, requiredProps) => {
        if (!TypeTester.isObject(obj)) {
            return false;
        }

        for (const [name, expected] of Object.entries(requiredProps)) {
            if (!(name in obj)) {
                return false;
            }

            const prop = obj[name];

            if (!TypeTester._validProp(prop, expected)) {
                return false;
            }
        }

        return true;
    }
});

export default TypeTester;
