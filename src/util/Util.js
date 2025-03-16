import { Buffer } from "node:buffer";
import { ChannelType, AttachmentBuilder } from "discord.js";

import syncFs from "node:fs";
import fs from "node:fs/promises";

import path from "node:path";
import URL from "node:url";

import { isPromise } from "./TypeTester.js";
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
            return (async () => {
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
            return (async () => {
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
            return (async () => {
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
        return str[0].toUpperCase() + str.slice(1);
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

    empty: obj => {
        return (obj?.length ?? obj?.size ?? 0) === 0;
    },

    single: obj => {
        return (obj?.length ?? obj?.size ?? 0) === 1;
    },

    multiple: obj => {
        return (obj?.length ?? obj?.size ?? 0) > 1;
    },

    first: (arr, start = 0) => {
        return arr[start];
    },

    last: (arr, start = 0) => {
        return arr[arr.length + start - 1];
    },

    randomElement: (arr, a = 0, b = arr.length) => {
        return arr[a + ~~(Math.random() * (b - a))];
    },

    _regexEscapeRegex: /[.*+?^${}()|[\]\\]/g,
    escapeRegex: str => {
        return str.replace(Util._regexEscapeRegex, "\\$&");
    },

    _charClassExcapeRegex: /[-\\\]^]/g,
    escapeCharClass: str => {
        return str.replace(Util._charClassExcapeRegex, "\\$&");
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
            name = str.slice(0, ind);
            args = str.slice(ind + sepLength);
        }

        if (lowercaseFirst) {
            name = name.toLowerCase();
        }

        if (lowercaseSecond) {
            args = args.toLowerCase();
        }

        return [name, args];
    },

    codeblockRegex: /(?<!\\)(?:`{3}([\S]+\n)?([\s\S]*?)`{3}|`([^`\n]+)`)/g,

    parseScript: script => {
        const match = script.match(Util._parseScriptRegex);

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

        for (let i = 0; i < str?.length; i++) {
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

    countChars: str => {
        return str?.length ?? 0;
    },

    countLines: str => {
        return str ? str.split("\n").length : 0;
    },

    overSizeLimits: (obj, charLimit, lineLimit) => {
        if (obj === null || typeof obj === "undefined") {
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

        if (embed === null || typeof embed === "undefined") {
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

        size += (embed.fields ?? []).reduce((sum, field) => {
            const { name, value, inline } = field;

            let nameSize = count(name),
                valueSize = count(value);

            if (countType === "lines" && name && !inline) {
                nameSize += 1;
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

        if (str.length > maxLength) {
            const trimmed = str.slice(0, maxLength);

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

            const durStr = duration.toLocaleString(),
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
    },

    bindArgs: (fn, ...boundArgs) => {
        return function (...args) {
            return fn.apply(this, boundArgs.concat(args));
        };
    },

    resolveObj(path, propertyMap) {
        if (typeof path !== "string") {
            throw new UtilError("Invalid path provided");
        }

        if (typeof propertyMap === "undefined") {
            throw new UtilError("Can't resolve object, no property map provided");
        }

        const split = path.split(".");

        let parent, obj;

        while (split.length > 0) {
            parent = obj;

            const propertyName = Util.first(split);

            if (typeof obj === "undefined") {
                obj = propertyMap[propertyName];
            } else {
                obj = obj[propertyName];
            }

            if (typeof obj === "undefined") {
                throw new UtilError("Property not found: " + propertyName);
            }

            split.shift();
        }

        return { obj, parent };
    }
};

Util.validUrlRegex = new RegExp(`^${Util.urlRegex.source}$`);
Util.parseScriptRegex = new RegExp(`^${Util.codeblockRegex.source}$`);

export default Util;
