import { Buffer } from "node:buffer";
import { AttachmentBuilder } from "discord.js";

import syncFs from "node:fs";
import fs from "node:fs/promises";

import path from "node:path";
import URL from "node:url";

const scriptRegex = /^`{3}([\S]+)?\n([\s\S]+)`{3}$/;

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

    delay: ms => {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    },

    import: async (modulePath, cache = true) => {
        let fileURL = URL.pathToFileURL(modulePath);

        if (!cache) {
            fileURL += `?update=${Date.now()}`;
        }

        return (await import(fileURL)).default;
    },

    splitArgs: (str, sep = " ") => {
        const ind = str.indexOf(sep);

        let name, args;

        if (ind === -1) {
            name = str;
            args = "";
        } else {
            name = str.substring(0, ind);
            args = str.substring(ind + sep.length);
        }

        return [name.toLowerCase(), args];
    },

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), {
            name: name
        });

        return {
            files: [attachment]
        };
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

    waitForCondition: (condition, timeoutError = "", timeout = 0, interval = 100) => {
        return new Promise((resolve, reject) => {
            let _timeout;

            if (timeout > 0) {
                _timeout = setTimeout(() => reject(timeoutError), timeout);
            }

            setInterval(() => {
                if (condition()) {
                    if (typeof _timeout !== "undefined") {
                        clearTimeout(_timeout);
                    }

                    resolve();
                }
            }, interval);
        });
    },

    parseScript: script => {
        const match = script.match(scriptRegex);

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

    capitalize: str => {
        str = ("" + str).toLowerCase();
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
                str = str.toString();
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

    duration: (delta, format = false, include) => {
        const durationNames = Object.keys(durationSeconds).filter(name => {
                if (Array.isArray(include)) {
                    return include.includes(name);
                }

                return name !== "milli";
            }),
            dur = {};

        let d_secs = delta * durationSeconds.milli;

        for (const name of durationNames) {
            const secs = durationSeconds[name],
                num = Math.floor(d_secs / secs);

            if (num > 0) {
                d_secs -= num * secs;
                dur[name] = num;
            }
        }

        if (!format) {
            return dur;
        }

        const _format = Object.entries(dur).map(entry => {
            const [name, dur] = entry,
                s = dur > 1 ? "s" : "";

            return `${dur} ${name}${s}`;
        });

        return _format.join(", ");
    }
};

export default Util;
