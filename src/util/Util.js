import fs from "node:fs/promises";

import TypeTester from "./TypeTester.js";

import UtilError from "../errors/UtilError.js";

let Util = {
    durationSeconds: {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
        second: 1,
        milli: 1 / 1000
    },

    numbers: "0123456789",
    alphabet: "abcdefghijklmnopqrstuvwxyz",

    parseInt: (str, radix = 10, defaultValue) => {
        if (typeof str !== "string" || typeof radix !== "number") {
            return defaultValue ?? NaN;
        }

        if (radix < 2 || radix > 36) {
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

    directoryExists: async path => {
        let stat;

        try {
            stat = await fs.stat(path);
        } catch (err) {
            if (err.code === "ENOENT") {
                return false;
            }

            throw err;
        }

        if (typeof stat !== "undefined") {
            return stat.isDirectory();
        }
    },

    delay: ms => {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, ms);
        });
    },

    waitForCondition: (condition, timeoutError, timeout = 0, interval = 100) => {
        return new Promise((resolve, reject) => {
            let _timeout, _interval;

            function clearTimers() {
                if (_timeout) {
                    clearTimeout(_timeout);
                }

                clearInterval(_interval);

                _timeout = undefined;
                _interval = undefined;
            }

            if (timeout > 0) {
                if (!(timeoutError instanceof Error)) {
                    timeoutError = new UtilError("Condition timed out");
                }

                _timeout = setTimeout(() => {
                    reject(timeoutError);
                    clearTimers();
                }, timeout);
            }

            _interval = setInterval(() => {
                let res;

                try {
                    res = condition();
                } catch (err) {
                    reject(err);
                    clearTimers();

                    return;
                }

                if (res) {
                    resolve();
                    clearTimers();

                    return;
                }
            }, interval);
        });
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

    removeRangeStr: (str, i, length = 1, end = false) => {
        const last = end ? length : i + length;
        return str.slice(0, i) + str.slice(last);
    },

    replaceRangeStr: (str, replacement, i, length = 1, end = false) => {
        const last = end ? length : i + length;
        return str.slice(0, i) + replacement + str.slice(last);
    },

    randomString: n => {
        const alphabet = Util.alphanumeric,
            result = Array(n);

        for (let i = 0; i < n; i++) {
            result[i] = alphabet[~~(Math.random() * alphabet.length)];
        }

        return result.join("");
    },

    utf8ByteLength: str => {
        let i = 0,
            len = Util.countChars(str);

        let codepoint,
            length = 0;

        for (; i < len; i++) {
            codepoint = str.codePointAt(i);

            if (codepoint <= 0x7f) {
                length += 1;
            } else if (codepoint <= 0x7ff) {
                length += 2;
            } else if (codepoint <= 0xffff) {
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

    trimString: (str, charLimit, lineLimit, showDiff = false) => {
        if (typeof str !== "string") {
            return str;
        }

        const oversized = TypeTester.overSizeLimits(str, charLimit, lineLimit);

        if (!oversized) {
            return str;
        }

        const [chars, lines] = oversized;

        if (chars !== null) {
            const trimmed = str.slice(0, charLimit);

            const diff = chars - charLimit,
                s = diff > 1 ? "s" : "";

            if (showDiff) {
                return `${trimmed} ... (${diff} more character${s})`;
            } else {
                return trimmed + "...";
            }
        } else if (lines !== null) {
            const split = str.split("\n"),
                trimmed = split.slice(0, lineLimit).join("\n");

            const diff = lines - lineLimit,
                s = diff > 1 ? "s" : "";

            if (showDiff) {
                return `${trimmed} ... (${diff} more line${s})`;
            } else {
                return trimmed + "...";
            }
        }
    },

    findNthCharacter: (str, char, n) => {
        let index = -1;

        while (n > 0) {
            index = str.indexOf(char, index + 1);

            if (index === -1) {
                return -1;
            }

            n--;
        }

        return index;
    },

    hasPrefix: (prefixes, str) => {
        if (!Array.isArray(prefixes)) {
            prefixes = [prefixes];
        }

        return prefixes.some(prefix => str.startsWith(prefix));
    },

    length: obj => {
        return obj?.length ?? obj?.size ?? 0;
    },

    stringLength: obj => {
        return obj == null ? 0 : String(obj).length;
    },

    empty: obj => {
        return Util.length(obj) === 0;
    },

    single: obj => {
        return Util.length(obj) === 1;
    },

    multiple: obj => {
        return Util.length(obj) > 1;
    },

    first: (array, start = 0) => {
        return array[start];
    },

    last: (array, start = 0) => {
        return array[array.length + start - 1];
    },

    after: (array, start = 0) => {
        return array.slice(start + 1);
    },

    randomElement: (array, a = 0, b = array.length) => {
        return array[a + ~~(Math.random() * (b - a))];
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
        return Math.floor(Math.abs(dt));
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
