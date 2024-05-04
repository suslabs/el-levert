import { Buffer } from "node:buffer";
import { AttachmentBuilder } from "discord.js";
import cloneDeep from "lodash.clonedeep";

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

const Util = {
    durationSeconds,
    splitArgs: str => {
        const ind = str.indexOf(" ");
        let name, args;

        if (ind === -1) {
            name = str;
            args = "";
        } else {
            name = str.substring(0, ind);
            args = str.substring(ind + 1);
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
            const sourceVal = source[key];

            if (sourceVal === null || typeof sourceVal === "undefined") {
                const defaultValue = cloneDeep(defaults[key]);
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
    import: async modulePath => {
        let fileURL = URL.pathToFileURL(modulePath);
        fileURL += `?update=${Date.now()}`;

        return (await import(fileURL)).default;
    },
    formatScript: str => {
        const match = str.match(scriptRegex);

        if (!match) {
            return [false, str];
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
        let s = str.length;

        for (let i = str.length - 1; i >= 0; i--) {
            var code = str.charCodeAt(i);
            if (code > 0x7f && code <= 0x7ff) {
                s++;
            } else if (code > 0x7ff && code <= 0xffff) {
                s += 2;
            }

            if (code >= 0xdc00 && code <= 0xdfff) {
                i--;
            }
        }

        return s;
    },
    capitalize: str => {
        return str[0].toUpperCase() + str.substring(1);
    },
    clamp: (x, a, b) => {
        return Math.max(Math.min(x, b), a);
    },
    round: (num, digits) => {
        return Math.round((num + Number.EPSILON) * 10 ** digits) / 10 ** digits;
    },
    randomElement: (arr, a = 0, b = arr.length) => {
        return arr[a + ~~(Math.random() * (b - a))];
    },
    formatLog(str, splitLength = 80, maxLength = 1000) {
        if (str === null) {
            return " ";
        }

        switch (typeof str) {
            case "undefined":
                return " ";
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
        }

        str = str.replaceAll(/[\n\r]/g, "\\$1");

        if (str.length > maxLength) {
            const diff = str.length - maxLength,
                s = diff > 1 ? "s" : "";

            return `\n---\n${str.substring(0, maxLength)} ... (${diff} more character${s})\n---`;
        }

        if (str.length > splitLength) {
            return `\n---\n${str}\n---`;
        }

        if (!/^(["'`])[\s\S]*\1$/.test(str)) {
            return ` "${str}"`;
        }

        return " " + str;
    },
    waitForCondition: (condition, timeoutError = "", timeout = 0, interval = 100) => {
        return new Promise((resolve, reject) => {
            let _timeout;

            if (timeout > 0) {
                _timeout = setTimeout(() => reject(timeoutError), timeout);
            }

            setInterval(() => {
                if (condition()) {
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }

                    resolve();
                }
            }, interval);
        });
    },
    duration: delta => {}
};

export default Util;
