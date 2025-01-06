import { Buffer } from "node:buffer";
import { AttachmentBuilder } from "discord.js";

import syncFs from "node:fs";
import fs from "node:fs/promises";

import path from "node:path";
import URL from "node:url";

import { isPromise } from "./TypeTester.js";
import UtilError from "../errors/UtilError.js";

const urlExp = /(\S*?):\/\/(?:([^/.]+)\.)?([^/.]+)\.([^/\s]+)\/?(\S*)?/,
    validUrlExp = new RegExp(`^${urlExp.toString()}$`);

const regexEscapeExp = /[.*+?^${}()|[\]\\]/g,
    charClassExcapeExp = /[-\\\]^]/g,
    scriptParseExp = /^(?:`{3}([\S]+\n)?([\s\S]+)`{3}|`([^`]+)`)$/;

const durationSeconds = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1,
    milli: 1 / 1000
};

const discordEpoch = 1420070400000;

const Util = {
    durationSeconds,
    discordEpoch,
    urlRegex: urlExp,

    parseInt: (str, radix = 10) => {
        if (typeof str !== "string" || typeof radix !== "number") {
            return NaN;
        }

        if (radix < 2 || radix > 36) {
            return NaN;
        }

        const validChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, radix),
            exp = new RegExp(`^[+-]?[${validChars}]+$`, "i");

        if (!exp.test(str)) {
            return NaN;
        }

        return Number.parseInt(str, radix);
    },

    zip: (arr_1, arr_2) => {
        const len = Math.min(arr_1.length, arr_2.length);
        return Array.from({ length: len }, (_, i) => [arr_1[i], arr_2[i]]);
    },

    import: async (modulePath, cache = true) => {
        let fileURL = URL.pathToFileURL(modulePath);

        if (!cache) {
            fileURL += `?update=${Date.now()}`;
        }

        return (await import(fileURL)).default;
    },

    getFilesRecSync: dir_path => {
        const files = [];

        function recursiveFunc(dir_path, arr) {
            syncFs.readdirSync(dir_path).forEach(itm => {
                const itmPath = path.join(dir_path, itm);

                if (syncFs.statSync(itmPath).isDirectory()) {
                    recursiveFunc(itmPath, arr);
                } else {
                    arr.push(itmPath);
                }
            });
        }

        recursiveFunc(dir_path, files);

        return files;
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

    setValuesWithDefaults: (target, source, defaults = {}) => {
        const values = {};

        for (const key of Object.keys(defaults)) {
            const sourceVal = source ? source[key] : undefined;

            if (sourceVal === null || typeof sourceVal === "undefined") {
                let defaultValue = defaults[key];

                switch (typeof defaultValue) {
                    case "function":
                        break;
                    default:
                        defaultValue = structuredClone(defaultValue);
                }

                values[key] = defaultValue;
            }
        }

        return Object.assign(target, {
            ...source,
            ...values
        });
    },

    delay: ms => {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    },

    waitForCondition: (condition, timeoutError, timeout = 0, interval = 100) => {
        return new Promise((resolve, reject) => {
            let _timeout, _interval;

            function clearTimers() {
                if (typeof _timeout !== "undefined") {
                    clearTimeout(_timeout);
                }

                clearInterval(_interval);

                _timeout = undefined;
                _interval = undefined;
            }

            if (timeout > 0) {
                if (typeof timeoutError === "undefined") {
                    timeoutError = new UtilError("Condition timed out");
                }

                _timeout = setTimeout(_ => {
                    reject(timeoutError);
                    clearTimers();
                }, timeout);
            }

            _interval = setInterval(_ => {
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

    removeItem: (arr, item, cb) => {
        const ind = arr.indexOf(item);

        if (ind === -1) {
            return false;
        }

        if (typeof cb === "undefined") {
            delete arr[ind];
            arr.splice(ind, 1);

            return true;
        }

        const ret = cb(item);

        if (isPromise(ret)) {
            return ret.then(_ => true);
        } else {
            delete arr[ind];
            arr.splice(ind, 1);

            return true;
        }
    },

    maybeAsyncForEach: (arr, cb) => {
        let length = arr.length,
            i = 0;

        let ret,
            loopPromise = false;

        for (; i < length; i++) {
            const item = arr[i];
            ret = cb(item, i);

            if (isPromise(ret)) {
                loopPromise = true;
                i++;

                break;
            }
        }

        if (loopPromise) {
            return (async _ => {
                ret = await ret;

                for (; i < length; i++) {
                    const item = arr[i];
                    await cb(item, i);
                }
            })();
        }
    },

    wipeArray: (arr, cb) => {
        let length = arr.length,
            i = 0;

        if (typeof cb === "undefined") {
            for (let i = 0; i < length; i++) {
                delete arr[i];
            }

            arr.length = 0;
            return length;
        }

        let n = 0;

        let ret,
            loopPromise = false;

        for (; i < length; i++) {
            const item = arr[i];
            ret = cb(item, i);

            if (isPromise(ret)) {
                loopPromise = true;
                i++;

                break;
            }

            const shouldDelete = ret ?? true;

            if (shouldDelete) {
                delete arr[i];
                n++;
            }
        }

        if (loopPromise) {
            return (async _ => {
                ret = await ret;

                for (; i < length; i++) {
                    const item = arr[i];
                    await cb(item, i);

                    const shouldDelete = ret ?? true;

                    if (shouldDelete) {
                        delete arr[i];
                        n++;
                    }
                }

                arr.length = 0;
                return n;
            })();
        } else {
            arr.length = 0;
            return n;
        }
    },

    wipeObject: (obj, cb) => {
        if (typeof cb === "undefined") {
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
            ret = cb(key, item, i);

            if (isPromise(ret)) {
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
            return (async _ => {
                ret = await ret;

                for (; i < length; i++) {
                    const [key, item] = entries[i];
                    await cb(key, item, i);

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
    },

    capitalize: str => {
        str = String(str).toLowerCase();
        return str[0].toUpperCase() + str.substring(1);
    },

    removeRangeStr: (str, i, length = 1) => {
        return str.slice(0, i) + str.slice(i + length);
    },

    replaceRangeStr: (str, replacement, i, length = 1) => {
        return str.slice(0, i) + replacement + str.slice(i + length);
    },

    clamp: (x, a, b) => {
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

    firstElement: (arr, start = 0) => {
        return arr[start];
    },

    lastElement: (arr, start = 0) => {
        return arr[arr.length + start - 1];
    },

    randomElement: (arr, a = 0, b = arr.length) => {
        return arr[a + ~~(Math.random() * (b - a))];
    },

    escapeRegex: str => {
        return str.replace(regexEscapeExp, "\\$&");
    },

    escapeCharClass: str => {
        return str.replace(charClassExcapeExp, "\\$&");
    },

    validUrl: url => {
        return validUrlExp.test(url);
    },

    splitArgs: (str, lowercase = false, options = {}) => {
        let multipleLowercase = Array.isArray(lowercase);

        if (!multipleLowercase && typeof lowercase === "object") {
            options = lowercase;

            lowercase = options.lowercase ?? false;
            multipleLowercase = Array.isArray(lowercase);
        }

        const lowercaseFirst = multipleLowercase ? (lowercase[0] ?? false) : lowercase,
            lowercaseSecond = multipleLowercase ? (lowercase[1] ?? false) : false;

        let { sep, n } = options;
        sep = sep ?? [" ", "\n"];
        n = n ?? 1;

        if (sep.length === 0) {
            if (lowercaseFirst) {
                return [str.toLowerCase(), ""];
            }

            return [str, ""];
        }

        if (!Array.isArray(sep)) {
            sep = [sep];
        }

        let name, args;
        let ind = -1,
            sepLength;

        if (sep.length === 1) {
            sep = sep[0] ?? sep;

            ind = str.indexOf(sep);
            sepLength = sep.length;

            if (n > 1) {
                for (let i = 1; i < n; i++) {
                    ind = str.indexOf(sep, ind + 1);

                    if (ind === -1) {
                        break;
                    }
                }
            }
        } else {
            const escaped = sep.map(x => Util.escapeRegex(x)),
                exp = new RegExp(escaped.join("|"), "g");

            if (n <= 1) {
                const match = exp.exec(str);

                if (match) {
                    ind = match.index;
                    sepLength = match[0].length;
                }
            } else {
                let match;

                for (let i = 1; (match = exp.exec(str)) !== null; i++) {
                    if (i === n) {
                        ind = match.index;
                        sepLength = match[0].length;

                        break;
                    } else if (i > n) {
                        ind = -1;
                        break;
                    }
                }
            }
        }

        if (ind === -1) {
            name = str;
            args = "";
        } else {
            name = str.substring(0, ind);
            args = str.substring(ind + sepLength);
        }

        if (lowercaseFirst) {
            name = name.toLowerCase();
        }

        if (lowercaseSecond) {
            args = args.toLowerCase();
        }

        return [name, args];
    },

    parseScript: script => {
        const match = script.match(scriptParseExp);

        if (!match) {
            return [false, script, ""];
        }

        const body = (match[2] ?? match[3])?.trim();

        if (typeof body === "undefined") {
            return [false, script, ""];
        }

        const lang = match[1]?.trim() ?? "";
        return [true, body, lang];
    },

    getUtf8ByteLength: str => {
        let length = 0;

        for (let i = 0; i < str.length; i++) {
            const codepoint = str.codePointAt(i);

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

    countLines: str => {
        return str.split("\n").length;
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

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), { name });

        return {
            files: [attachment]
        };
    },

    snowflakeFromDate: date => {
        const timestamp = date.getTime() - discordEpoch,
            snowflakeBits = BigInt(timestamp) << 22n;

        return snowflakeBits.toString(10);
    },

    dateFromSnowflake: snowflake => {
        const snowflakeBits = BigInt.asUintN(64, snowflake),
            timestamp = Number(snowflakeBits >> 22n);

        return new Date(timestamp + discordEpoch);
    },

    getEmbedSize(embed, countURLs = false) {
        if (typeof embed.data !== "undefined") {
            embed = embed.data;
        }

        let size = 0;

        size += embed.title?.length ?? 0;
        size += embed.description?.length ?? 0;

        size += embed.author?.name?.length ?? 0;
        size += embed.timestamp?.length ?? 0;
        size += embed.footer?.text?.length ?? 0;

        if (countURLs) {
            size += embed.url?.length ?? 0;
            size += embed.thumbnail?.url?.length ?? 0;
            size += embed.image?.url?.length ?? 0;

            size += embed.author?.icon_url?.length ?? 0;
            size += embed.author?.url?.length ?? 0;

            size += embed.footer?.icon_url?.length ?? 0;
        }

        if (typeof embed.fields === "undefined") {
            return size;
        }

        size += embed.fields.reduce((sum, val) => {
            const { name, value } = val;

            const nameLength = name?.length ?? 0,
                valueLength = value?.length ?? 0;

            return sum + nameLength + valueLength;
        }, 0);

        return size;
    },

    formatLog(str, splitLength = 80, maxLength = 1000) {
        if (str === null) {
            return " none";
        }

        switch (typeof str) {
            case "undefined":
                return " none";
            case "bigint":
            case "boolean":
            case "number":
                str = str.toString(10);
                break;
            case "object":
                try {
                    str = JSON.stringify(str);
                    break;
                } catch (err) {
                    return ` error: ${err.message}`;
                }
            case "string":
                if (str.length < 1) {
                    return " none";
                }

                break;
        }

        str = str.replace(/\n|\r\n/g, "\\n");
        str = str.replaceAll("`", "\\`");

        if (str.length > maxLength) {
            const trimmed = str.substring(0, maxLength);

            const diff = str.length - maxLength,
                s = diff > 1 ? "s" : "";

            return `\n---\n${trimmed} ... (${diff} more character${s})\n---`;
        }

        if (str.length > splitLength) {
            return `\n---\n${str}\n---`;
        }

        const quotesExp = /^(["'])[\s\S]*\1$/;

        if (quotesExp.test(str)) {
            return " " + str;
        }

        return ` "${str}"`;
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

        const durationNames = Object.keys(durationSeconds).filter(name => {
                const inWhitelist = whitelist.length ? blacklist.includes(name) : true,
                    inBlacklist = blacklist.includes(name);

                return inWhitelist && !inBlacklist;
            }),
            durations = {};

        let d_secs = delta * durationSeconds.milli;

        if (d_secs < 1 && durationNames.includes("second")) {
            durations["second"] = d_secs;
        } else {
            let hitFirst = false,
                n = 0;

            for (const name of durationNames) {
                const secs = durationSeconds[name],
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

            const durStr = duration.toLocaleString(),
                s = duration !== 1 ? "s" : "";

            return `${durStr} ${name}${s}`;
        });

        return _format.join(", ");
    },

    bindArgs: (fn, ...boundArgs) => {
        return function (...args) {
            return fn.apply(this, boundArgs.concat(args));
        };
    },

    outOfRange(propName, min, max, ...args) {
        const hasPropName = typeof propName === "string",
            getProp = hasPropName ? obj => obj[propName] : obj => obj;

        if (!hasPropName) {
            args = [max].concat(args);

            max = min;
            min = propName;
        }

        if (args.length === 1) {
            const obj = args[0],
                prop = getProp(obj);

            if (typeof prop === "undefined") {
                return false;
            }

            return prop < min || prop > max;
        }

        return args.find(obj => {
            const prop = getProp(obj);

            if (typeof prop === "undefined") {
                return false;
            }

            return prop < min || prop > max;
        });
    }
};

export default Util;
