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
                
                if(fs.statSync(itmPath).isDirectory()) {
                    recursiveFunc(itmPath, arr);
                } else {
                    arr.push(itmPath);
                }
            });
        }
        
        recursiveFunc(dir_path, files);

        return files;
    },
    randElem: arr => arr[~~(Math.random() * arr.length)],
    clamp: (x, a, b) => Math.max(Math.min(x, b), a),
    round: (num, digits) => Math.round((num + Number.EPSILON) * 10 ** digits) / (10 ** digits),
    splitArgs: str => {
        const ind = str.indexOf(" ");
        let name, args;

        if(ind === -1) {
            name = str;
            args = "";
        } else {
            name = str.slice(0, ind),
            args = str.slice(ind + 1);
        }

        return [name.toLowerCase(), args];
    },
    getIcon: user => `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp`,
    diceDist: (a, b) => {
        if(typeof a !== "string" && typeof a !== typeof b) {
            return 0;
        } else if(a === b) {
            return 1;
        } else if(a.length === 1 && b.length === 1) {
            return 0;
        }
    
        const bg_a = Array(a.length - 1),
              bg_b = Array(b.length - 1);
    
        for(let i = 0; i < a.length; i++) {
            if(i === 0) {
                bg_a[i] = a.charCodeAt(i) << 16;
            } else if (i === a.length - 1) {
                bg_a[i - 1] |= a.charCodeAt(i);
            } else {
                bg_a[i] = (bg_a[i - 1] |= a.charCodeAt(i)) << 16;
            }
        }
    
        for(let i = 0; i < b.length; i++) {
            if(i === 0) {
                bg_b[i] = b.charCodeAt(i) << 16;
            } else if (i === b.length - 1) {
                bg_b[i - 1] |= b.charCodeAt(i);
            } else {
                bg_b[i] = (bg_b[i - 1] |= b.charCodeAt(i)) << 16;
            }
        }
    
        bg_a.sort();
        bg_b.sort();
    
        let m = 0,
            i = 0,
            j = 0;
    
        while(i < a.length - 1 && j < b.length - 1) {
            if(bg_a[i] === bg_b[j]) {
                m += 2;
    
                i++;
                j++;
            } else if(bg_a[i] < bg_b[j]) {
                i++;
            } else {
                j++;
            }
        }
        
        return m / (a.length + b.length - 2);
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
            } else if (code > 0x7ff && code <= 0xffff){
                s+=2;
            }

            if (code >= 0xDC00 && code <= 0xDFFF) {
                i--; 
            }
        }

        return s;
    },
    isScript: body => body.startsWith("```") && body.endsWith("```"),
    removeBlock: body => {
        const match = body.match(/^`{3}([\S]+)?\n([\s\S]+)`{3}$/);
        return match[2];
    },
    firstCharUpper: str => str[0].toUpperCase() + str.substring(1)
};

export default Util;