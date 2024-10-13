import { Buffer } from "node:buffer";
import { AttachmentBuilder } from "discord.js";

import syncFs from "node:fs";
import fs from "node:fs/promises";

import path from "node:path";
import URL from "node:url";

import { isPromise } from "./TypeTester.js";

const regexEscapeExp = /[.*+?^${}()|[\]\\]/g,
    scriptParseExp = /^`{3}([\S]+)?\n([\s\S]+)`{3}$/;

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
                const itmPath = path.resolve(dir_path, itm);

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
                    timeoutError = new Error("Condition timed out");
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

    clamp: (x, a, b) => {
        return Math.max(Math.min(x, b), a);
    },

    round: (num, digits) => {
        const exp = 10 ** digits;
        return Math.round((num + Number.EPSILON) * exp) / exp;
    },

    firstElement: (arr, start = 0) => {
        return arr[start];
    },

    lastElement: (arr, start = 0) => {
        return arr[arr.length + start - 1];
    },

    randomElement: (arr, a = 0, b = arr.length - 1) => {
        return arr[a + ~~(Math.random() * (b - a))];
    },

    escapeRegex: str => {
        return str.replace(regexEscapeExp, "\\$&");
    },

    splitArgs: (str, lowercase = false, options = {}) => {
        let multipleLowercase = Array.isArray(lowercase);

        if (!multipleLowercase && typeof lowercase === "object") {
            options = lowercase;

            lowercase = options.lowercase ?? false;
            multipleLowercase = Array.isArray(lowercase);
        }

        const lowercaseFirst = multipleLowercase ? lowercase[0] ?? false : lowercase,
            lowercaseSecond = multipleLowercase ? lowercase[1] ?? false : false;

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
            return [false, script];
        }

        let lang = match[1],
            body = match[2];

        if (typeof body === "undefined") {
            body = lang;
            lang = "";
        }

        return [true, body, lang];
    },

    getByteLen: str => {
        let len = str.length;

        for (let i = str.length - 1; i >= 0; i--) {
            const code = str.charCodeAt(i);

            if (code > 0x7f && code <= 0x7ff) {
                len++;
            } else if (code > 0x7ff && code <= 0xffff) {
                len += 2;
            }

            if (code >= 0xdc00 && code <= 0xdfff) {
                i--;
            }
        }

        return len;
    },

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), {
            name: name
        });

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

    timeDelta: (d1, d2) => {
        const t1 = typeof d1 === "object" ? d1.getTime() : Number(d1),
            t2 = typeof d2 === "object" ? d2.getTime() : Number(d2);

        return Math.abs(t2 - t1);
    },

    duration: (delta, format = false, include) => {
        const durationNames = Object.keys(durationSeconds).filter(name => {
                if (Array.isArray(include)) {
                    return include.includes(name);
                }

                return name !== "milli";
            }),
            durations = {};

        let d_secs = delta * durationSeconds.milli;

        if (d_secs < 1) {
            durations["second"] = d_secs;
        } else {
            for (const name of durationNames) {
                const secs = durationSeconds[name],
                    duration = Math.floor(d_secs / secs);

                if (duration > 0) {
                    d_secs -= duration * secs;
                    durations[name] = duration;
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
    }
};

export default Util;
