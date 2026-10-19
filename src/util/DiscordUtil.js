import { Buffer } from "node:buffer";
import path from "node:path";

import axios from "axios";

import { EmbedBuilder, ChannelType, AttachmentBuilder, inlineCode, codeBlock } from "discord.js";

import Util from "./Util.js";
import LoggerUtil from "./LoggerUtil.js";
import TypeTester from "./TypeTester.js";
import ObjectUtil from "./ObjectUtil.js";
import ArrayUtil from "./ArrayUtil.js";

import { EmbedCountAreas, validEmbedCountAreas } from "./EmbedCountAreas.js";
import { CountTypes } from "./CountTypes.js";
import { validBinaryExtensions, validTextExtensions } from "./misc/FileExtensions.js";

import UtilError from "../errors/UtilError.js";

let DiscordUtil = {
    msgCharLimit: 2000,
    embedCharLimit: 4096,

    threadChannelTypes: new Set([ChannelType.PublicThread, ChannelType.PrivateThread]),

    userIdRegex: /\d{17,20}/g,
    // userIdRegex: /[A-Za-z0-9]{24,30}/g,

    findUserIds: str => {
        const matches = Array.from(str.matchAll(DiscordUtil.userIdRegex));
        return matches.map(match => match[0]);
    },

    mentionRegex: /<@!?(\d{17,20})>/g,
    // mentionRegex: /<@([A-Za-z0-9]{24,30})>/g,

    findMentions: str => {
        const matches = Array.from(str.matchAll(DiscordUtil.mentionRegex));
        return matches.map(match => match[1]);
    },

    formatUser: (user, id = null, discord = false, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const isDiscord = options.discord ?? discord,
            possessive = options.possessive ?? false;

        let username = null;

        if (TypeTester.isObject(user)) {
            username = user.username;
            id = user.id;
        } else if (id !== null) {
            username = user;
        } else {
            id = user;
        }

        if (Util.empty(id) || id === "0") {
            return "invalid";
        }

        const formattedId = isDiscord ? inlineCode(id) : id;

        if (Util.nonemptyString(username)) {
            const name = possessive ? `${username}'s` : username;
            return `${name} (${formattedId})`;
        }

        return possessive ? `${formattedId}'s` : formattedId;
    },

    codeblockRegex: /(?<!\\)(?:`{3}([\S]+\n)?([\s\S]*?)`{3}|`([^`\n]+)`)/g,

    findCodeblocks: str => {
        const matches = str.matchAll(DiscordUtil.codeblockRegex);
        return Array.from(matches).map(match => [match.index, match.index + match[0].length]);
    },

    maskCodeblocks: (str, mask = " ") => {
        return Util.maskRanges(str, DiscordUtil.findCodeblocks(str), mask);
    },

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), { name });
        return { files: [attachment] };
    },

    formatErrorEmbed: (header, err, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const filename = options.filename ?? "error.js",
            charLimit = options.charLimit ?? DiscordUtil.embedCharLimit,
            lang = options.lang ?? options.language ?? "js";

        const errMsg = Util.getErrorMessage(err),
            formatted = Util.empty(lang) ? codeBlock(errMsg) : codeBlock(lang, errMsg);

        const res = { content: header };

        if (!Util.overSizeLimits(formatted, charLimit)) {
            const embed = new EmbedBuilder().setDescription(formatted);
            res.embeds = [embed];
        } else {
            res.files = DiscordUtil.getFileAttach(errMsg, filename).files;
        }

        return res;
    },

    getMessageUrl: (sv_id, ch_id, msg_id) => {
        return `https://www.discord.com/channels/${sv_id}/${ch_id}/${msg_id}`;
    },

    msgUrlRegex:
        /(?:(https?:)\/\/)?(?:(www|ptb|canary)\.)?discord\.com\/channels\/(?<sv_id>\d{18,19}|@me)\/(?<ch_id>\d{18,19})(?:\/(?<msg_id>\d{18,19}))/gi,

    _msgUrlMatchResult: match => {
        if (!match) {
            return null;
        }

        const groups = match.groups;

        return {
            raw: match[0],

            protocol: match[1] ?? "",
            subdomain: match[2] ?? "",

            sv_id: groups.sv_id,
            ch_id: groups.ch_id,
            msg_id: groups.msg_id
        };
    },

    parseMessageUrl: url => {
        const match = url.match(DiscordUtil.singleMsgRegex);
        return DiscordUtil._msgUrlMatchResult(match);
    },

    findMessageUrls: str => {
        DiscordUtil.msgUrlRegex.lastIndex = 0;

        const matches = Array.from(str.matchAll(DiscordUtil.msgUrlRegex));
        return matches.map(match => DiscordUtil._msgUrlMatchResult(match));
    },

    attachUrlRegex:
        /(?<prefix>(?:(https?:)\/\/)?(cdn|media)\.discordapp\.(com|net)\/attachments\/(?<sv_id>\d+)\/(?<ch_id>\d+)\/(?<filename>[^/?#\s]+?)(?<ext>\.[^.?#\s]+)?(?=\?|\s|$))\??(?:ex=(?<ex>[0-9a-f]+)&is=(?<is>[0-9a-f]+)&hm=(?<hm>[0-9a-f]+))?/giu,

    _attachUrlMatchResult: match => {
        if (!match) {
            return null;
        }

        const groups = match.groups;

        const filename = groups.filename,
            ext = groups.ext ?? "";

        return {
            prefix: groups.prefix,
            protocol: match[2] ?? "",
            subdomain: match[3],
            tld: match[4],

            serverId: groups.sv_id,
            channelId: groups.ch_id,

            filename,
            ext,
            file: filename + ext,

            search: groups.search ? "?" + groups.search : "",
            ex: groups.ex,
            is: groups.is,
            hm: groups.hm
        };
    },

    isAttachmentUrl: url => {
        if (!Util.nonemptyString(url)) {
            return false;
        }

        DiscordUtil.singleAttachRegex.lastIndex = 0;
        return DiscordUtil.singleAttachRegex.test(url.trim());
    },

    parseAttachmentUrl: url => {
        const match = url.match(DiscordUtil.singleAttachRegex);
        return DiscordUtil._attachUrlMatchResult(match);
    },

    findAttachmentUrls: str => {
        DiscordUtil.attachUrlRegex.lastIndex = 0;

        const matches = Array.from(str.matchAll(DiscordUtil.attachUrlRegex));
        return matches.map(match => DiscordUtil._attachUrlMatchResult(match));
    },

    hasAttachmentUrls: str => {
        if (!Util.nonemptyString(str)) {
            return false;
        }

        DiscordUtil.attachUrlRegex.lastIndex = 0;
        return DiscordUtil.attachUrlRegex.test(str);
    },

    discordEpoch: 1420070400000,

    snowflakeFromDate: date => {
        const timestamp = date.getTime() - DiscordUtil.discordEpoch,
            snowflakeBits = BigInt(timestamp) << 22n;

        return snowflakeBits.toString(10);
    },

    dateFromSnowflake: snowflake => {
        const snowflakeBits = BigInt.asUintN(64, snowflake),
            timestamp = Number(snowflakeBits >> 22n);

        return new Date(timestamp + DiscordUtil.discordEpoch);
    },

    isThreadChannel: channel => {
        const type = TypeTester.isObject(channel) ? channel.type : channel;
        return DiscordUtil.threadChannelTypes.has(type);
    },

    formatChannelName: (channel, currentGuild) => {
        if (channel.type === ChannelType.DM) {
            return "DMs";
        }

        const inThread = DiscordUtil.isThreadChannel(channel),
            hasGuild = [currentGuild, channel.guild].every(obj => typeof obj !== "undefined");

        const nameFormat = inThread
            ? `"${channel.name}" (thread of parent channel #${channel.parent?.name ?? "unknown"})`
            : `#${channel.name}`;

        return hasGuild && channel.guild.id !== currentGuild.id ? `${nameFormat} in ${channel.guild.name}` : nameFormat;
    },

    getEmbedData: embed => {
        return embed?.data ?? embed;
    },

    getBuiltEmbed: embed => {
        return embed instanceof EmbedBuilder ? embed.toJSON() : embed;
    },

    stringifyEmbed: (embed, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const useHeaders = options.headers ?? false,
            includeURLs = options.urls ?? true;

        const embedData = DiscordUtil.getEmbedData(embed);

        if (embedData == null) {
            return "";
        }

        let blocks = [];

        const titleParts = [],
            bodyParts = [],
            fieldParts = [],
            footerParts = [];

        if (!Util.empty(embedData.author?.name)) {
            let icon = "";

            if (includeURLs && !Util.empty(embedData.author.icon_url)) {
                icon = `(${embedData.author.icon_url}) `;
            }

            titleParts.push(`${icon}${embedData.author.name}`.trim());
        }

        if (!Util.empty(embedData.title)) {
            let url = "";

            if (includeURLs && !Util.empty(embedData.url)) {
                url = ` (${embedData.url})`;
            }

            titleParts.push(`${embedData.title}${url}`);
        }

        if (useHeaders) {
            titleParts.unshift("[Title]");
            titleParts.push("---");
        }

        blocks.push(titleParts.join("\n"));

        if (includeURLs && !Util.empty(embedData.thumbnail?.url)) {
            bodyParts.push(`(${embedData.thumbnail.url})`);
        }

        if (!Util.empty(embedData.description)) {
            bodyParts.push(embedData.description);
        }

        if (includeURLs && !Util.empty(embedData.image?.url)) {
            bodyParts.push(`(${embedData.image.url})`);
        }

        if (useHeaders) {
            bodyParts.unshift("[Body]");
            bodyParts.push("---");
        }

        blocks.push(bodyParts.join("\n"));

        if (!Util.empty(embedData.fields)) {
            embedData.fields.forEach((field, i) => {
                ArrayUtil.wipeArray(fieldParts);

                if (!Util.empty(field.name)) {
                    fieldParts.push(field.name);
                }

                if (!Util.empty(field.value)) {
                    fieldParts.push(field.value);
                }

                if (useHeaders) {
                    fieldParts.unshift(`[Field ${i + 1}]`);
                    fieldParts.push("---");
                }

                blocks.push(fieldParts.join("\n"));
            });
        }

        if (!Util.empty(embedData.footer?.text)) {
            let icon = "";

            if (includeURLs && !Util.empty(embedData.footer.icon_url)) {
                icon = `(${embedData.footer.icon_url}) `;
            }

            footerParts.push(`${icon}${embedData.footer.text}`.trim());
        }

        if (!Util.empty(embedData.timestamp)) {
            footerParts.push(`At ${embedData.timestamp}`);
        }

        if (useHeaders) {
            footerParts.unshift("[Footer]");
            footerParts.push("---");
        }

        blocks.push(footerParts.join("\n"));

        blocks = blocks.filter(part => !Util.empty(part));
        return blocks.join("\n\n");
    },

    getEmbedSize: (embed, options) => {
        options = ObjectUtil.guaranteeObject(options);

        let countType = options.count ?? CountTypes.chars,
            countAreas = options.areas ?? EmbedCountAreas.all,
            countURLs = options.urls ?? false;

        const embedData = DiscordUtil.getEmbedData(embed);

        if (embedData == null) {
            return 0;
        }

        const count = Util._countFunc(countType);

        let size = 0;

        if (countAreas === EmbedCountAreas.all) {
            countAreas = Array.from(validEmbedCountAreas);
        } else {
            countAreas = ArrayUtil.guaranteeArray(countAreas).map(area =>
                TypeTester.normalizeEnum(area, validEmbedCountAreas, "count areas", UtilError)
            );
        }

        const hasContent = countAreas.includes(EmbedCountAreas.content),
            hasBody = countAreas.includes(EmbedCountAreas.body),
            hasDetails = countAreas.includes(EmbedCountAreas.details),
            hasFields = countAreas.includes(EmbedCountAreas.fields);

        if (hasContent) {
            size += count(embedData.title);
            size += count(embedData.description);
        } else if (hasBody) {
            size += count(embedData.description);
        }

        if (hasDetails) {
            size += count(embedData.author?.name);
            size += count(embedData.timestamp);
            size += count(embedData.footer?.text);

            if (countType === CountTypes.chars && countURLs) {
                size += count(embedData.url);
                size += count(embedData.thumbnail?.url);
                size += count(embedData.image?.url);

                size += count(embedData.author?.icon_url);
                size += count(embedData.author?.url);

                size += count(embedData.footer?.icon_url);
            }
        }

        if (!hasFields) {
            return size;
        }

        const fieldsSize = (embedData.fields ?? []).reduce((sum, field, i) => {
            const { name, value, inline } = field;

            if (countType === CountTypes.lines && i > 0 && inline) {
                return sum;
            }

            let nameSize = count(name),
                valueSize = count(value);

            if (countType === CountTypes.lines && name) {
                nameSize++;
            }

            return sum + nameSize + valueSize;
        }, 0);

        return size + fieldsSize;
    },

    overSizeLimits: (embed, charLimit, lineLimit, options) => {
        if (!TypeTester.isObject(embed)) {
            return false;
        }

        options = ObjectUtil.guaranteeObject(options);

        let count = 0;

        if (typeof charLimit === "number") {
            count = DiscordUtil.getEmbedSize(embed, {
                ...options,
                count: CountTypes.chars
            });

            if (count > charLimit) {
                return [count, null];
            }
        }

        if (typeof lineLimit === "number") {
            count = DiscordUtil.getEmbedSize(embed, {
                ...options,
                count: CountTypes.lines
            });

            if (count > lineLimit) {
                return [null, count];
            }
        }

        return false;
    },

    _mdDelimiters: [
        { pattern: "```", length: 3 },
        { pattern: "**", length: 2 },
        { pattern: "__", length: 2 },
        { pattern: "~~", length: 2 },
        { pattern: "||", length: 2 },
        { pattern: "*", length: 1 },
        { pattern: "_", length: 1 },
        { pattern: "`", length: 1 }
    ],
    markdownTrimString: (str, charLimit, lineLimit) => {
        let stack = [];

        let contentCount = 0,
            i = 0;

        let isEscaped = false;

        while (i < str.length && contentCount < charLimit) {
            if (str[i] === "\\" && !isEscaped) {
                isEscaped = true;
                i++;

                continue;
            }

            let mdFound = false;

            if (!isEscaped) {
                for (const { pattern, length } of DiscordUtil._mdDelimiters) {
                    const part = str.slice(i, i + length);

                    if (part === pattern) {
                        const hasContentAfter = !Util.empty(part.trim());

                        if (hasContentAfter) {
                            stack[stack.length - 1] === pattern ? stack.pop() : stack.push(pattern);
                        }

                        i += length;
                        mdFound = true;

                        break;
                    }
                }
            }

            if (!mdFound) {
                if (!isEscaped) {
                    contentCount++;
                }

                isEscaped = false;

                i++;
            }
        }

        const suffix = stack.reverse().join("");
        return Util.trimString(str, charLimit + 2 * suffix.length, lineLimit + 1) + suffix;
    },

    trimEmbed(embed, charLimit, lineLimit, options) {
        options = ObjectUtil.guaranteeObject(options);

        const embedData = DiscordUtil.getEmbedData(embed);

        let oversized = options.oversized;

        if (oversized === true) {
            oversized = DiscordUtil.overSizeLimits(embedData, charLimit, lineLimit, {
                areas: EmbedCountAreas.body
            });
        }

        if (oversized == null) {
            oversized = DiscordUtil.overSizeLimits(embedData, charLimit, lineLimit, {
                areas: EmbedCountAreas.body
            });
        }

        if (oversized) {
            embedData.description = Util.trimString(embedData.description, charLimit, lineLimit, {
                ...options,
                oversized
            });
        }

        if (
            DiscordUtil.overSizeLimits(embedData, charLimit, lineLimit, {
                areas: EmbedCountAreas.fields
            })
        ) {
            delete embedData.fields;
        }

        return embedData;
    },

    _fetchAttachmentDefaults: {
        allowedContentType: [],
        allowedContentTypes: [],
        maxSize: Infinity
    },
    fetchAttachment: async (msg, responseType = "text", options = {}) => {
        options = ObjectUtil.setValuesWithDefaults({}, options, DiscordUtil._fetchAttachmentDefaults);

        const ctypes = [].concat(options.allowedContentType, options.allowedContentTypes);

        const maxSizeKb = Math.round(options.maxSize),
            maxSize = maxSizeKb * Util.dataBytes.kilobyte;

        const maxSizeError = attachSize =>
            new UtilError(`The attachment can take up at most ${maxSizeKb} kb`, { attachSize, maxSizeKb });

        const attach = msg.file ?? msg.attachments?.at(0),
            url = msg.fileUrl ?? attach?.url;

        if (!Util.nonemptyString(url)) {
            throw new UtilError("Message doesn't have any attachments");
        }

        const attachInfo = msg.attachInfo ?? DiscordUtil.parseAttachmentUrl(url),
            contentType = attach?.contentType;

        const [ctypePrefs, extensions] = ArrayUtil.split(ctypes, type => type.startsWith("."));

        if (!Util.empty(extensions)) {
            if (Util.empty(attachInfo?.ext)) {
                throw new UtilError("Extension can only be validated for attachment URLs");
            }

            TypeTester.normalizeEnum(attachInfo.ext, extensions, "file extension", UtilError);
        }

        if (!Util.empty(ctypePrefs)) {
            if (contentType == null) {
                throw new UtilError("Attachment doesn't have a content type");
            } else if (!Util.hasPrefix(ctypePrefs, contentType)) {
                throw new UtilError("Invalid content type: " + contentType, contentType);
            }
        }

        if (attach?.size > maxSize) {
            throw maxSizeError();
        }

        let res = null;

        try {
            res = await axios.request({
                url,
                maxContentLength: maxSize,
                responseType
            });
        } catch (err) {
            throw err.message.startsWith("maxContentLength") ? maxSizeError() : err;
        }

        return { attach, body: res.data, contentType };
    },

    rebindMessage: (msg, client) => {
        const ch_id = msg.channel.id;
        delete msg.channel;

        const channel = client.channels.cache.get(ch_id);
        Object.defineProperty(msg, "channel", { value: channel });
    },

    logAttachCharLimit: 2000,
    logAttachByteLimit: 256,

    formatMessageLog: (data, splitLength = 80, maxLength = 2500, options) => {
        if (data == null) {
            return LoggerUtil.formatLog(null, splitLength, maxLength);
        }

        const payload = Array.isArray(data) && Util.single(data) ? Util.first(data) : data,
            normalized = DiscordUtil._formatMessagePayload(payload, options);

        return LoggerUtil.formatLog(normalized, splitLength, maxLength);
    },

    _isBinaryAttachment: (buf, name = "") => {
        const ext = path.extname(name).toLowerCase();

        if (validBinaryExtensions.has(ext)) {
            return true;
        } else if (validTextExtensions.has(ext)) {
            return false;
        }

        const sample = buf.subarray(0, 1024);
        return sample.includes(0);
    },

    _formatAttachment: (file, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const charLimit = options.charLimit ?? DiscordUtil.logAttachCharLimit,
            byteLimit = options.byteLimit ?? DiscordUtil.logAttachByteLimit;

        let name = "attachment",
            data = null;

        if (file instanceof AttachmentBuilder) {
            name = file.name ?? "attachment";
            data = file.attachment;
        } else if (Buffer.isBuffer(file)) {
            name = "attachment.bin";
            data = file;
        } else if (TypeTester.isObject(file)) {
            name = file.name ?? "attachment";
            data = file.attachment ?? file.data;
        } else {
            return file;
        }

        let buf = null;

        if (Buffer.isBuffer(data)) {
            buf = data;
        } else if (typeof data === "string") {
            buf = Buffer.from(data, "utf8");
        } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
            buf = Buffer.from(data);
        }

        if (buf === null) {
            const size = file.size ?? 0,
                res = { name, size };

            if (data != null) {
                res.data = typeof data === "object" ? data.constructor.name : String(data);
            }

            return res;
        }

        const size = file.size ?? buf.length,
            isBinary = DiscordUtil._isBinaryAttachment(buf, name);

        const res = { name, size };

        if (isBinary) {
            const hexSlice = buf.subarray(0, byteLimit),
                hexStr = Util.bytesToHex(hexSlice);

            res.data = buf.length > byteLimit ? `${hexStr}...` : hexStr;
        } else {
            const text = buf.toString("utf8");

            res.data = Util.trimString(text, charLimit, null, {
                showDiff: true
            });
        }

        return res;
    },

    _formatMessagePayload: (data, options) => {
        if (data == null) {
            return null;
        } else if (data instanceof AttachmentBuilder || Buffer.isBuffer(data)) {
            return DiscordUtil._formatAttachment(data, options);
        } else if (data instanceof EmbedBuilder) {
            return DiscordUtil.getBuiltEmbed(data);
        } else if (Array.isArray(data)) {
            return data.map(item => DiscordUtil._formatMessagePayload(item, options));
        } else if (TypeTester.isObject(data)) {
            const res = { ...data };

            if (Array.isArray(res.files)) {
                res.files = res.files.map(file => DiscordUtil._formatAttachment(file, options));
            } else if (res.files != null) {
                res.files = DiscordUtil._formatAttachment(res.files, options);
            }

            if (Array.isArray(res.embeds)) {
                res.embeds = res.embeds.map(embed => DiscordUtil.getBuiltEmbed(embed));
            } else if (res.embeds != null) {
                res.embeds = DiscordUtil.getBuiltEmbed(res.embeds);
            }

            return res;
        } else {
            return data;
        }
    }
};

{
    DiscordUtil.parseScriptRegex = new RegExp(`^${DiscordUtil.codeblockRegex.source}$`);
    DiscordUtil.singleMsgRegex = new RegExp(`^${DiscordUtil.msgUrlRegex.source}$`, "i");
    DiscordUtil.singleAttachRegex = new RegExp(`^(?:${DiscordUtil.attachUrlRegex.source})$`, "iu");
}

DiscordUtil = Object.freeze(DiscordUtil);
export default DiscordUtil;
