import fs from "node:fs/promises";

import TypeTester from "./TypeTester.js";

import LengthTypes from "./LengthTypes.js";
import CountTypes from "./CountTypes.js";

import UtilError from "../errors/UtilError.js";

let Util = {
    durationSeconds: Object.freeze({
        milli: 1 / 1000,
        second: 1,
        minute: 60,
        hour: 3600,
        day: 86400,
        month: 2592000,
        week: 604800,
        year: 31536000
    }),

    dataBytes: Object.freeze({
        byte: 1,
        kilobyte: 1024,
        megabyte: 1048576,
        gigabyte: 1073741824,
        terabyte: 1099511627776
    }),

    numbers: "0123456789",
    alphabet: "abcdefghijklmnopqrstuvwxyz",

    random: (a, b) => {
        return a + ~~(Math.random() * (b - a));
    },

    parseInt: (str, radix = 10, defaultValue) => {
        if (typeof str !== "string" || typeof radix !== "number" || radix < 2 || radix > 36) {
            return defaultValue ?? NaN;
        }

        str = str.trim();
        const exp = Util._validNumberRegexes.get(radix);

        if (!exp.test(str)) {
            return defaultValue ?? NaN;
        }

        str = str.replaceAll(",", "");
        return Number.parseInt(str, radix);
    },

    truthyStrings: new Set(["true", "yes", "y", "t"]),
    falsyStrings: new Set(["false", "no", "n", "f"]),

    parseBool: (str, defaultValue) => {
        if (typeof str !== "string") {
            return defaultValue ?? null;
        }

        str = str.trim().toLowerCase();

        if (Util.truthyStrings.has(str)) {
            return true;
        } else if (Util.falsyStrings.has(str)) {
            return false;
        } else {
            return defaultValue ?? null;
        }
    },

    formatNumber: (num, digits) => {
        const options = {
            maximumFractionDigits: digits
        };

        if ((num !== 0 && Math.abs(num) < 1e-6) || Math.abs(num) >= 1e21) {
            const str = num.toLocaleString("en-US", {
                notation: "scientific",
                useGrouping: false,
                ...options
            });

            return str.toLowerCase();
        }

        return num.toLocaleString("en-US", options);
    },

    splitAt: (str, sep = " ") => {
        const idx = str.indexOf(sep);

        let first, second;

        if (idx === -1) {
            first = str;
            second = "";
        } else {
            first = str.slice(0, idx);
            second = str.slice(idx);
        }

        return [first, second];
    },

    directoryExists: async path => {
        try {
            return (await fs.stat(path)).isDirectory();
        } catch (err) {
            return err.code === "ENOENT"
                ? false
                : (() => {
                      throw err;
                  })();
        }
    },

    delay: ms => {
        ms = Math.round(ms);
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    runWithTimeout: (callback, timeoutError, timeout = 10000) => {
        if (typeof callback !== "function") {
            throw new UtilError("Callback function required");
        }

        timeout = Util.clamp(timeout, 0);

        if (typeof timeoutError === "string") {
            timeoutError = new Error(timeoutError);
        } else if (!(timeoutError instanceof Error)) {
            timeoutError = new UtilError("Operation timed out");
        }

        const res = callback();

        if (timeout <= 0 || !TypeTester.isPromise(res)) {
            return Promise.resolve(res);
        }

        let _timeout = null;

        const clearTimer = () => {
            clearTimeout(_timeout);
            _timeout = null;
        };

        const timeoutPromise = new Promise((_, reject) => {
            _timeout = setTimeout(() => reject(timeoutError), timeout);
        });

        return Promise.race([res.finally(clearTimer), timeoutPromise]);
    },

    waitForCondition: (condition, timeoutError, timeout = 0, interval = 100) => {
        let [_timeout, _interval] = [null, null];

        if (timeout > 0) {
            if (typeof timeoutError === "string") {
                timeoutError = new Error(timeoutError);
            } else if (!(timeoutError instanceof Error)) {
                timeoutError = new UtilError("Condition timed out");
            }
        }

        const clearTimers = () => {
            if (_timeout !== null) {
                clearTimeout(_timeout);
            }

            clearInterval(_interval);

            _timeout = _interval = null;
        };

        return new Promise((resolve, reject) => {
            if (timeout > 0) {
                _timeout = setTimeout(() => {
                    clearTimers();
                    reject(timeoutError);
                }, timeout);
            }

            _interval = setInterval(() => {
                let val = null;

                try {
                    val = !!condition();
                } catch (err) {
                    clearTimers();
                    reject(err);

                    return;
                }

                if (val) {
                    clearTimers();
                    resolve();

                    return;
                }
            }, interval);
        });
    },

    maybeAsyncThen: (res, thenFn, errorFn) => {
        if (TypeTester.isPromise(res)) {
            return res.then(thenFn, errorFn);
        }

        try {
            return typeof thenFn === "function" ? thenFn(res) : res;
        } catch (err) {
            return typeof errorFn === "function"
                ? errorFn(err)
                : (() => {
                      throw err;
                  })();
        }
    },

    stripSpaces: str => {
        return str.replace(/\s+/g, "");
    },

    _leadingSpacesRegex: /^\s*/,
    _trailingSpacesRegex: /\s*$/,
    capitalize: str => {
        str = String(str);

        const leading = str.match(Util._leadingSpacesRegex)[0],
            trailing = str.match(Util._trailingSpacesRegex)[0];

        const content = str.slice(leading.length, str.length - trailing.length);

        if (content.length < 1) {
            return str;
        } else {
            return leading + content[0].toUpperCase() + content.slice(1) + trailing;
        }
    },

    _camelToWordsRegex: /([a-z])([A-Z])/g,
    camelCaseToWords: str => {
        const words = str.replace(Util._camelToWordsRegex, "$1 $2");
        return words.toLowerCase();
    },

    _wordsToCamelRegex: /(?:^\w|[A-Z]|\b\w|\s+)/g,
    wordsToCamelCase: str => {
        str = str.toLowerCase();

        const camel = str.replace(Util._wordsToCamelRegex, (match, i) => match[`to${i ? "Upper" : "Lower"}Case`]());
        return Util.stripSpaces(camel);
    },

    hasDuplicates: (str, sep = "") => {
        if (str.length < 1) {
            return false;
        }

        const split = sep === "" ? str : str.split(sep);
        return new Set(split).length === split.length;
    },

    unique: (str, sep = "") => {
        if (str.length < 1) {
            return str;
        }

        const split = sep === "" ? str : str.split(sep);
        return [...new Set(split)].join(sep);
    },

    removeStringRange: (str, i, length = 1, end = false) => {
        const last = end ? length : i + length;
        return str.slice(0, i) + str.slice(last);
    },

    replaceStringRange: (str, replacement, i, length = 1, end = false) => {
        const last = end ? length : i + length;
        return str.slice(0, i) + replacement + str.slice(last);
    },

    randomString: n => {
        return Util.randomElement(Util.alphanumeric, 0, Util.alphanumeric.length, n).join("");
    },

    utf8ByteLength: str => {
        let i = 0,
            len = Util.countChars(str);

        let code,
            length = 0;

        for (; i < len; i++) {
            code = str.codePointAt(i);

            if (code <= 0x7f) {
                length += 1;
            } else if (code <= 0x7ff) {
                length += 2;
            } else if (code <= 0xffff) {
                length += 3;
            } else {
                length += 4;
                i++;
            }
        }

        return length;
    },

    countChars: str => {
        return str?.length ?? 0;
    },

    countLines: str => {
        if (typeof str !== "string") {
            return 0;
        }

        let count = 1,
            pos = 0;

        while ((pos = str.indexOf("\n", pos)) !== -1) {
            count++;
            pos++;
        }

        return count;
    },

    _countFunc: countType => {
        if (!Util.nonemptyString(countType)) {
            throw new UtilError("No count type provided");
        }

        switch (countType) {
            case CountTypes.chars:
                return Util.countChars;
            case CountTypes.lines:
                return Util.countLines;
            default:
                throw new UtilError("Invalid count type: " + countType, countType);
        }
    },
    getCount: (str, countType) => {
        return Util._countFunc(countType)(str);
    },

    overSizeLimits: (str, charLimit, lineLimit) => {
        if (typeof str !== "string") {
            return false;
        }

        let count = null;

        if (typeof charLimit === "number") {
            count = Util.countChars(str);

            if (count > charLimit) {
                return [count, null];
            }
        }

        if (typeof lineLimit === "number") {
            count = Util.countLines(str);

            if (count > lineLimit) {
                return [null, count];
            }
        }

        return false;
    },

    trimString: (str, charLimit, lineLimit, options = {}) => {
        if (typeof str !== "string") {
            return str;
        }

        const tight = options.tight ?? false,
            showDiff = options.showDiff ?? false;

        let oversized = options.oversized;

        if (oversized == null) {
            oversized = Util.overSizeLimits(str, charLimit, lineLimit);
        }

        if (!oversized) {
            return str;
        }

        const [chars, lines] = oversized;

        if (chars !== null) {
            if (showDiff) {
                let suffix, trimmed;

                const getSuffix = limit => {
                    const diff = chars - limit,
                        s = diff > 1 ? "s" : "";

                    return ` ... (${diff} more character${s})`;
                };

                if (tight) {
                    let newLimit = charLimit;

                    do {
                        newLimit--;

                        trimmed = str.slice(0, newLimit);
                        suffix = getSuffix(newLimit);
                    } while (trimmed.length + suffix.length > charLimit && newLimit > 0);

                    if (suffix.length > charLimit) {
                        suffix = "...";
                    }
                } else {
                    trimmed = str.slice(0, charLimit);
                    suffix = getSuffix(charLimit);
                }

                return (trimmed + suffix).trim();
            } else {
                const newLimit = tight ? Util.clamp(charLimit - 3, 0) : charLimit,
                    trimmed = str.slice(0, newLimit);

                return trimmed + "...";
            }
        } else if (lines !== null) {
            if (showDiff) {
                let split = str.split("\n"),
                    trimmed = split.slice(0, lineLimit).join("\n");

                const diff = lines - lineLimit,
                    s = diff > 1 ? "s" : "";

                let suffix = ` ... (${diff} more line${s})`;

                if (tight) {
                    if (suffix.length > charLimit) {
                        suffix = "...";
                    }

                    const newLimit = Util.clamp(charLimit - suffix.length, 0);
                    trimmed = trimmed.slice(0, newLimit);
                }

                return (trimmed + suffix).trim();
            } else {
                let split = str.split("\n"),
                    trimmed = split.slice(0, lineLimit).join("\n");

                if (tight) {
                    const newLimit = Util.clamp(charLimit - 3, 0);
                    trimmed = trimmed.slice(0, newLimit);
                }

                return trimmed + "...";
            }
        }
    },

    findNthCharacter: (str, char, n) => {
        let idx = -1;

        for (; n > 0; n--) {
            idx = str.indexOf(char, idx + 1);

            if (idx === -1) {
                return -1;
            }
        }

        return idx;
    },

    hasPrefix: (prefixes, str) => {
        prefixes = Array.isArray(prefixes) ? prefixes : [prefixes];
        return prefixes.some(prefix => str.startsWith(prefix));
    },

    length: val => {
        return val?.length ?? val?.size ?? 0;
    },

    stringLength: val => {
        return val == null ? 0 : String(val).length;
    },

    _lengthFunc: lengthType => {
        if (!Util.nonemptyString(lengthType)) {
            throw new UtilError("No length type provided");
        }

        switch (lengthType) {
            case LengthTypes.array:
                return Util.length;
            case LengthTypes.string:
                return Util.stringLength;
            default:
                throw new UtilError("Invalid length type: " + lengthType, lengthType);
        }
    },
    getLength: (val, lengthType) => {
        return Util._lengthFunc(lengthType)(val);
    },

    nonemptyString: str => {
        return typeof str === "string" && str.length > 0;
    },

    empty: val => {
        return Util.length(val) === 0;
    },

    single: val => {
        return Util.length(val) === 1;
    },

    multiple: val => {
        return Util.length(val) > 1;
    },

    first: (val, start = 0, n = 1) => {
        return n > 1 ? val.slice(start, start + n) : val[start];
    },

    last: (val, end = 0, n = 1) => {
        return n > 1 ? val.slice(-end - n, -end || undefined) : val.at(-end - 1);
    },

    after: (val, start = 0, n = -1) => {
        return n > 0 ? val.slice(start + 1, start + 1 + n) : val.slice(start + 1);
    },

    before: (val, end = 0, n = -1) => {
        return n > 0 ? val.slice(Math.max(0, end - n), end) : val.slice(0, end);
    },

    randomElement: (val, a = 0, b = val.length, n = 1) => {
        return n > 1 ? Array.from({ length: n }, () => val[Util.random(a, b)]) : val[Util.random(a, b)];
    },

    setFirst(array, value, start = 0) {
        array[start] = value;
        return array;
    },

    setLast(array, value, end = 0) {
        array[array.length - end - 1] = value;
        return array;
    },

    setAfter(array, value, start = 0) {
        array.splice(start + 1, value.length, ...value);
        return array;
    },

    setRandomElement(array, value, a = 0, b = array.length) {
        array[a + ~~(Math.random() * (b - a))] = value;
        return array;
    },

    clamp: (x, a, b) => {
        a ??= -Infinity;
        b ??= Infinity;

        return Math.max(Math.min(x, b), a);
    },

    round: (num, digits) => {
        const exp = 10 ** digits;
        return Math.round((num + Number.EPSILON) * exp) / exp;
    },

    smallRound: (num, digits) => {
        const tresh = 1 / 10 ** digits;

        if (Math.abs(num) <= tresh) {
            digits = -Math.floor(Math.log10(Math.abs(num)));
        }

        return Util.round(num, digits);
    },

    approxEquals: (a, b, epsilon = Number.EPSILON) => {
        return Math.abs(a - b) <= epsilon;
    },

    deviate: (x, y) => {
        return x + (Math.random() * (2 * y) - y);
    },

    countDigits: (num, base = 10) => {
        if (num === 0) {
            return 1;
        }

        const log = Math.log(Math.abs(num)) / Math.log(base);
        return Math.floor(log) + 1;
    },

    urlRegex: /(\S*?):\/\/(?:([^/.]+)\.)?([^/.]+)\.([^/\s]+)\/?(\S*)?/,

    validUrl: url => {
        return Util.validUrlRegex.test(url);
    },

    timeDelta: (d1, d2, div = 1) => {
        let t1 = d1.getTime?.() ?? d1,
            t2 = d2.getTime?.() ?? d2;

        if ([typeof d1, typeof d2].includes("bigint")) {
            t1 = BigInt(t1);
            t2 = BigInt(t2);

            div = BigInt(div);
        } else {
            t1 = Number(t1);
            t2 = Number(t2);
        }

        const dt = (t2 - t1) / div;
        return Math.round(Math.abs(dt));
    },

    duration: (delta, options = {}) => {
        const format = options.format ?? false,
            largestOnly = options.largestOnly ?? false,
            largestN = options.largestN ?? 0;

        const whitelist = Array.isArray(options.whitelist) ? options.whitelist : [],
            blacklist = Array.isArray(options.blacklist) ? options.blacklist : ["milli"];

        const durationNames = Object.keys(Util.durationSeconds).filter(name => {
                const inWhitelist = whitelist.length ? blacklist.includes(name) : true,
                    inBlacklist = blacklist.includes(name);

                return inWhitelist && !inBlacklist;
            }),
            durations = {};

        let d_secs = delta * Util.durationSeconds.milli;

        if (d_secs < 1 && durationNames.includes("second")) {
            durations["second"] = d_secs;
        } else {
            let hitFirst = false,
                n = 0;

            for (const name of durationNames) {
                const secs = Util.durationSeconds[name],
                    duration = Math.floor(d_secs / secs);

                if (duration > 0) {
                    hitFirst = true;

                    d_secs -= duration * secs;
                    durations[name] = duration;

                    if (largestOnly) {
                        break;
                    }
                }

                if (hitFirst) {
                    n++;
                }

                if (largestN > 0 && n >= largestN) {
                    break;
                }
            }
        }

        if (!format) {
            return durations;
        }

        const _format = Object.entries(durations).map(entry => {
            const [name, duration] = entry;

            const durStr = Util.formatNumber(duration),
                s = duration !== 1 ? "s" : "";

            return `${durStr} ${name}${s}`;
        });

        return _format.join(", ");
    }
};

{
    Util.alphabetUpper = Util.alphabet.toUpperCase();
    Util.alphanumericUpper = Util.numbers + Util.alphabetUpper;
    Util.alphanumeric = Util.numbers + Util.alphabet + Util.alphabetUpper;

    Util._validNumberRegexes = new Map();

    for (let radix = 2; radix <= 36; radix++) {
        const validChars = Util.alphanumericUpper.slice(0, radix),
            exp = new RegExp(`^[+-]?[${validChars}]+(,[${validChars}]+)*$`, "i");

        Util._validNumberRegexes.set(radix, exp);
    }

    Util.validUrlRegex = new RegExp(`^${Util.urlRegex.source}$`);
}

Util = Object.freeze(Util);
export default Util;
