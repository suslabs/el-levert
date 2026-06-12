import Util from "./Util.js";
import ArrayUtil from "./ArrayUtil.js";
import ObjectUtil from "./ObjectUtil.js";

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

    isRegex: exp => {
        return TypeTester.isObject(exp) && typeof exp.source === "string" && typeof exp.flags === "string";
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

    _normalizeEnumValues(valid) {
        if (valid instanceof Set) {
            return valid;
        } else if (TypeTester.isArray(valid)) {
            return new Set(valid);
        } else if (TypeTester.isObject(valid)) {
            return new Set(Object.values(valid));
        } else {
            return new Set();
        }
    },

    _missingEnumMessage(input, name, options) {
        const msg = options.missing ?? options.message ?? false;

        if (typeof msg === "function") {
            return msg(input);
        } else if (typeof msg === "boolean") {
            return msg ? `No ${name} provided` : `Invalid ${name}`;
        } else {
            return `${msg} ${name}`;
        }
    },

    _unknownEnumMessage(input, name, options) {
        let msg = options.unknown ?? options.message ?? false;

        if (typeof msg === "function") {
            return msg(input);
        } else if (typeof msg === "boolean") {
            msg = msg ? "Unknown" : "Invalid";
        }

        const out = `${msg} ${name}`;
        return options.ref === false ? out : `${out}: ${input}`;
    },

    _checkEnum(value, valid, options) {
        const input = value;

        const allowEmpty = options.allowEmpty ?? false;

        if (!allowEmpty && Util.empty(value)) {
            return {
                input,
                state: "missing"
            };
        }

        if (typeof options.normalize === "function") {
            value = options.normalize(value);
        }

        if (!valid.has(value)) {
            return {
                input,
                state: "unknown"
            };
        }

        return {
            input,
            value,
            state: null
        };
    },

    _throwEnum(res, name, errorClass, options) {
        switch (res.state) {
            case "missing":
                throw new errorClass(TypeTester._missingEnumMessage(res.input, name, options), res.input);
            case "unknown":
                throw new errorClass(TypeTester._unknownEnumMessage(res.input, name, options), res.input);
        }
    },
    normalizeEnum(value, valid, name = "value", errorClass = UtilError, options) {
        options = ObjectUtil.guaranteeObject(options);
        valid = TypeTester._normalizeEnumValues(valid);

        const res = TypeTester._checkEnum(value, valid, options);
        TypeTester._throwEnum(res, name, errorClass, options);

        return res.value;
    },

    normalizeEnums(values, valid, name = "value", errorClass = UtilError, options) {
        values = ArrayUtil.guaranteeArray(values);

        options = ObjectUtil.guaranteeObject(options);
        valid = TypeTester._normalizeEnumValues(valid);

        const collectInvalid = options.collectInvalid ?? false;

        const out = [],
            invalid = [];

        for (const value of values) {
            const res = TypeTester._checkEnum(value, valid, options);

            if (res.state === null) {
                out.push(res.value);
            } else if (collectInvalid) {
                invalid.push(res.input);
            } else {
                TypeTester._throwEnum(res, name, errorClass, options);
            }
        }

        if (!Util.empty(invalid)) {
            throw new errorClass(TypeTester._unknownEnumMessage(invalid[0], name, options), invalid);
        }

        return out;
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
            if (!Object.hasOwn(obj, name)) {
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
