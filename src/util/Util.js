import { isPromise } from "node:util/types";

import { Buffer } from "node:buffer";
import { ChannelType, AttachmentBuilder } from "discord.js";

import fs from "node:fs/promises";
import path from "node:path";
import URL from "node:url";

import { isObject } from "./misc/TypeTester.js";

import UtilError from "../errors/UtilError.js";

const Util = {
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

            if (sourceVal == null) {
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

    removeItem: (array, item, callbacl) => {
        let ind;

        if (typeof item === "function") {
            ind = array.findIndex(item);
        } else {
            ind = array.indexOf(item);
        }

        if (ind === -1) {
            return false;
        }

        if (typeof callbacl === "undefined") {
            delete array[ind];
            array.splice(ind, 1);

            return true;
        }

        const ret = callbacl(ind, array);

        if (isPromise(ret)) {
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

            if (isPromise(ret)) {
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

            if (isPromise(ret)) {
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

    concat: (a, ...args) => {
        const concatenated = [].concat(a, ...args);

        if (Array.isArray(a)) {
            return concatenated;
        }

        return concatenated.join("");
    },

    removeRangeStr: (str, i, length = 1) => {
        return str.slice(0, i) + str.slice(i + length);
    },

    replaceRangeStr: (str, replacement, i, length = 1) => {
        return str.slice(0, i) + replacement + str.slice(i + length);
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

    countDigits: (num, base = 10) => {
        if (num === 0) {
            return 1;
        }

        const log = Math.log(Math.abs(num)) / Math.log(base);
        return Math.floor(log) + 1;
    },

    length: obj => {
        return obj?.length ?? obj?.size ?? 0;
    },

    stringLength: obj => {
        return obj == null ? 0 : String(obj).length;
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

    _regexEscapeRegex: /[.*+?^${}()|[\]\\]/g,
    escapeRegex: str => {
        return str.replace(Util._regexEscapeRegex, "\\$&");
    },

    _charClassExcapeRegex: /[-\\\]^]/g,
    escapeCharClass: str => {
        return str.replace(Util._charClassExcapeRegex, "\\$&");
    },

    firstGroup: (match, name) => {
        if (!match) {
            return;
        }

        const groups = Object.keys(match.groups).filter(key => typeof match.groups[key] !== "undefined"),
            foundName = groups.find(key => key => key.startsWith(name));

        if (typeof foundName === "undefined") {
            return;
        }

        return match.groups[foundName];
    },

    urlRegex: /(\S*?):\/\/(?:([^/.]+)\.)?([^/.]+)\.([^/\s]+)\/?(\S*)?/,

    validUrl: url => {
        return Util.validUrlRegex.test(url);
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

        let sep = options.sep ?? [" ", "\n"],
            n = options.n ?? 1;

        if (sep.length === 0) {
            if (lowercaseFirst) {
                return [str.toLowerCase(), ""];
            }

            return [str, ""];
        }

        if (!Array.isArray(sep)) {
            sep = [sep];
        }

        let first, second;

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
            const escaped = sep.map(item => Util.escapeRegex(item)),
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
            first = str;
            second = "";
        } else {
            first = str.slice(0, ind);
            second = str.slice(ind + sepLength);
        }

        if (lowercaseFirst) {
            first = first.toLowerCase();
        }

        if (lowercaseSecond) {
            second = second.toLowerCase();
        }

        return [first, second];
    },

    codeblockRegex: /(?<!\\)(?:`{3}([\S]+\n)?([\s\S]*?)`{3}|`([^`\n]+)`)/g,

    parseScript: script => {
        const match = script.match(Util.parseScriptRegex);

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

    checkCharType: char => {
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

    utf8ByteLength: str => {
        let i = 0,
            len = Util.countChars(str);

        let codepoint,
            length = 0;

        for (let i = 0; i < len; i++) {
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

    overSizeLimits: (obj, charLimit, lineLimit) => {
        if (obj == null) {
            return false;
        }

        if (typeof charLimit === "number") {
            const count =
                typeof obj === "string"
                    ? Util.countChars(obj)
                    : Util.getEmbedSize(obj, {
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
                    : Util.getEmbedSize(obj, {
                          count: "lines"
                      });

            if (count > lineLimit) {
                return [null, count];
            }
        }

        return false;
    },

    trimString: (str, charLimit, lineLimit, showDiff = false) => {
        const oversized = Util.overSizeLimits(str, charLimit, lineLimit);

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

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), { name });

        return {
            files: [attachment]
        };
    },

    userIdRegex: /\d{17,20}/g,

    findUserIds: str => {
        const matches = Array.from(str.matchAll(Util.userIdRegex));
        return matches.map(match => match[0]);
    },

    mentionRegex: /<@(\d{17,20})>/g,

    findMentions: str => {
        const matches = Array.from(str.matchAll(Util.mentionRegex));
        return matches.map(match => match[1]);
    },

    msgUrlRegex:
        /(?:(https?:)\/\/)?(?:(www|ptb)\.)?discord\.com\/channels\/(?<sv_id>\d{18,19}|@me)\/(?<ch_id>\d{18,19})(?:\/(?<msg_id>\d{18,19}))/g,

    findMessageUrls: str => {
        const matches = Array.from(str.matchAll(Util.msgUrlRegex));

        return matches.map(match => {
            const groups = match.groups;

            return {
                raw: match[0],

                protocol: match[1] ?? "",
                subdomain: match[2] ?? "",

                sv_id: groups.sv_id,
                ch_id: groups.ch_id,
                msg_id: groups.msg_id
            };
        });
    },

    discordEpoch: 1420070400000,

    snowflakeFromDate: date => {
        const timestamp = date.getTime() - Util.discordEpoch,
            snowflakeBits = BigInt(timestamp) << 22n;

        return snowflakeBits.toString(10);
    },

    dateFromSnowflake: snowflake => {
        const snowflakeBits = BigInt.asUintN(64, snowflake),
            timestamp = Number(snowflakeBits >> 22n);

        return new Date(timestamp + Util.discordEpoch);
    },

    formatChannelName: channel => {
        const inDms = channel.type === ChannelType.DM;

        if (inDms) {
            return "DMs";
        }

        const inThread = [ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type);

        if (inThread) {
            return `"${channel.name}" (thread of parent channel #${channel.parent.name})`;
        }

        return `#${channel.name}`;
    },

    getEmbedSize(embed, options = {}) {
        const countType = options.count ?? "chars",
            countURLs = options.countURLs ?? false;

        if (typeof embed.data !== "undefined") {
            embed = embed.data;
        }

        if (embed == null) {
            return 0;
        }

        let size = 0,
            count;

        switch (countType) {
            case "chars":
                count = Util.countChars;
                break;
            case "lines":
                count = Util.countLines;
                break;
            default:
                throw new UtilError("Invalid count type: " + countType);
        }

        size += count(embed.title);
        size += count(embed.description);

        size += count(embed.author?.name);
        size += count(embed.timestamp);
        size += count(embed.footer?.text);

        if (countType === "chars" && countURLs) {
            size += count(embed.url);
            size += count(embed.thumbnail?.url);
            size += count(embed.image?.url);

            size += count(embed.author?.icon_url);
            size += count(embed.author?.url);

            size += count(embed.footer?.icon_url);
        }

        size += (embed.fields ?? []).reduce((sum, field, i) => {
            const { name, value, inline } = field;

            if (countType === "lines" && i > 0 && inline) {
                return sum;
            }

            let nameSize = count(name),
                valueSize = count(value);

            if (countType === "lines" && name) {
                nameSize++;
            }

            return sum + nameSize + valueSize;
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
        str = Util.trimString(str, maxLength, null, true);

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

    bindArgs: (fn, boundArgs) => {
        if (!Array.isArray(boundArgs)) {
            boundArgs = [boundArgs];
        }

        return function (...args) {
            return fn.apply(this, boundArgs.concat(args));
        };
    },

    className: obj => {
        if (obj == null) {
            return "";
        }

        if (typeof obj === "function") {
            obj = obj.prototype;
        }

        return obj.constructor.name;
    },

    _funcArgsRegex: /(?:\()(.+)+(?:\))/,
    functionArgumentNames: func => {
        const str = func.toString(),
            match = str.match(Util._funcArgsRegex);

        if (!match) {
            return [];
        }

        const args = match[1];
        return args.split(", ").map(arg => arg.trim());
    },

    _validProp: (obj, expected) => {
        if (typeof expected === "string") {
            if (expected === "object") {
                return isObject(obj);
            } else {
                return typeof obj === expected;
            }
        }

        if (typeof expected === "function") {
            return obj instanceof expected;
        }

        if (isObject(expected)) {
            if (isObject(obj)) {
                return Util.validateProps(obj, expected);
            } else {
                return false;
            }
        }

        throw new UtilError("Invalid expected type");
    },
    validateProps: (obj, requiredProps) => {
        for (const [name, expected] of Object.entries(requiredProps)) {
            const prop = obj[name];

            if (!Util._validProp(prop, expected)) {
                return false;
            }
        }

        return true;
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
    Util.parseScriptRegex = new RegExp(`^${Util.codeblockRegex.source}$`);
}

export default Util;
