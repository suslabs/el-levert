import { Buffer } from "buffer";
import { AttachmentBuilder } from "discord.js";

import fs from "fs";
import path from "path";

const Util = {
    getFilesRecSync: dir_path => {
        const files = [];

        function recursiveFunc(dir_path, arr) {
            fs.readdirSync(dir_path).forEach(itm => {
                const itmPath = path.resolve(dir_path, itm);

                if (fs.statSync(itmPath).isDirectory()) {
                    recursiveFunc(itmPath, arr);
                } else {
                    arr.push(itmPath);
                }
            });
        }

        recursiveFunc(dir_path, files);

        return files;
    },
    randElement: arr => arr[~~(Math.random() * arr.length)],
    clamp: (x, a, b) => Math.max(Math.min(x, b), a),
    round: (num, digits) => Math.round((num + Number.EPSILON) * 10 ** digits) / 10 ** digits,
    splitArgs: str => {
        const ind = str.indexOf(" ");
        let name, args;

        if (ind === -1) {
            name = str;
            args = "";
        } else {
            name = str.slice(0, ind);
            args = str.slice(ind + 1);
        }

        return [name.toLowerCase(), args];
    },
    getFileAttach: (data, name = "message.txt") => ({
        files: [
            new AttachmentBuilder(Buffer.from(data), {
                name: name
            })
        ]
    }),
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
    formatScript: body => {
        const match = body.match(/^`{3}([\S]+)?\n([\s\S]+)`{3}$/);

        if (match) {
            return [match[2], true];
        }

        return [body, false];
    },
    firstCharUpper: str => str[0].toUpperCase() + str.substring(1),
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
    }
};

export default Util;
