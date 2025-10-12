import { Buffer } from "node:buffer";

import axios from "axios";

import { EmbedBuilder, ChannelType, AttachmentBuilder } from "discord.js";

import Util from "./Util.js";
import TypeTester from "./TypeTester.js";
import ArrayUtil from "./ArrayUtil.js";

import UtilError from "../errors/UtilError.js";

let DiscordUtil = {
    msgCharLimit: 2000,
    embedCharLimit: 4096,

    userIdRegex: /\d{17,20}/g,

    findUserIds: str => {
        const matches = Array.from(str.matchAll(DiscordUtil.userIdRegex));
        return matches.map(match => match[0]);
    },

    mentionRegex: /<@(\d{17,20})>/g,

    findMentions: str => {
        const matches = Array.from(str.matchAll(DiscordUtil.mentionRegex));
        return matches.map(match => match[1]);
    },

    codeblockRegex: /(?<!\\)(?:`{3}([\S]+\n)?([\s\S]*?)`{3}|`([^`\n]+)`)/g,

    findCodeblocks: str => {
        const matches = str.matchAll(DiscordUtil.codeblockRegex);
        return Array.from(matches).map(match => [match.index, match.index + match[0].length]);
    },

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), { name });
        return { files: [attachment] };
    },

    msgUrlRegex:
        /(?:(https?:)\/\/)?(?:(www|ptb)\.)?discord\.com\/channels\/(?<sv_id>\d{18,19}|@me)\/(?<ch_id>\d{18,19})(?:\/(?<msg_id>\d{18,19}))/g,

    findMessageUrls: str => {
        const matches = Array.from(str.matchAll(DiscordUtil.msgUrlRegex));

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

    attachUrlRegex:
        /^(?<prefix>(?:(https?:)\/\/)?(cdn|media)\.discordapp\.(com|net)\/attachments\/(?<sv_id>\d+)\/(?<ch_id>\d+)\/(?<filename>.+?)(?<ext>\.[^.?]+)?(?=\?|$))\??(?:ex=(?<ex>[0-9a-f]+)&is=(?<is>[0-9a-f]+)&hm=(?<hm>[0-9a-f]+))?.*$/,

    parseAttachmentUrl: url => {
        const match = url.match(DiscordUtil.attachUrlRegex);

        if (!match) {
            return;
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

    formatChannelName: channel => {
        const inDms = channel.type === ChannelType.DM,
            inThread = [ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type);

        if (inDms) {
            return "DMs";
        } else {
            return inThread
                ? `"${channel.name}" (thread of parent channel #${channel.parent.name})`
                : `#${channel.name}`;
        }
    },

    getEmbedData: embed => {
        return embed?.data ?? embed;
    },

    getBuiltEmbed: embed => {
        return embed instanceof EmbedBuilder ? embed.toJSON() : embed;
    },

    stringifyEmbed: (embed, options = {}) => {
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

    _countAreas: ["body", "content", "details", "fields"],
    getEmbedSize: (embed, options = {}) => {
        let countType = options.count ?? "chars",
            countAreas = options.areas ?? "all",
            countURLs = options.urls ?? false;

        const embedData = DiscordUtil.getEmbedData(embed);

        if (embedData == null) {
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
                throw new UtilError("Invalid count type: " + countType, countType);
        }

        if (countAreas === "all") {
            countAreas = DiscordUtil._countAreas;
        } else {
            countAreas = ArrayUtil.guaranteeArray(countAreas);

            if (!countAreas.every(area => DiscordUtil._countAreas.includes(area))) {
                throw new UtilError("Invalid count areas", countAreas);
            }
        }

        if (countAreas.includes("content")) {
            size += count(embedData.title);
            size += count(embedData.description);
        } else if (countAreas.includes("body")) {
            size += count(embedData.description);
        }

        if (countAreas.includes("details")) {
            size += count(embedData.author?.name);
            size += count(embedData.timestamp);
            size += count(embedData.footer?.text);

            if (countType === "chars" && countURLs) {
                size += count(embedData.url);
                size += count(embedData.thumbnail?.url);
                size += count(embedData.image?.url);

                size += count(embedData.author?.icon_url);
                size += count(embedData.author?.url);

                size += count(embedData.footer?.icon_url);
            }
        }

        if (!countAreas.includes("fields")) {
            return size;
        }

        const fieldsSize = (embedData.fields ?? []).reduce((sum, field, i) => {
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

        return size + fieldsSize;
    },

    overSizeLimits: (embed, charLimit, lineLimit, options = {}) => {
        if (!TypeTester.isObject(embed)) {
            return false;
        }

        let count;

        if (typeof charLimit === "number") {
            count = DiscordUtil.getEmbedSize(embed, {
                ...options,
                count: "chars"
            });

            if (count > charLimit) {
                return [count, null];
            }
        }

        if (typeof lineLimit === "number") {
            count = DiscordUtil.getEmbedSize(embed, {
                ...options,
                count: "lines"
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
        let stack = [],
            contentCount = 0,
            i = 0,
            isEscaped = false;

        while (i < str.length && contentCount < charLimit) {
            if (str[i] === "\\" && !isEscaped) {
                isEscaped = true;
                i++;

                continue;
            }

            let mdFound = false;

            if (!isEscaped) {
                for (const { pattern, length } of DiscordUtil._mdDelimiters) {
                    const part = str.slice(i, length);

                    if (part === pattern) {
                        const hasContentAfter = part.trim().length > 0;

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

    trimEmbed(embed, charLimit, lineLimit, options = {}) {
        const embedData = DiscordUtil.getEmbedData(embed);

        let oversized = options.oversized;

        if (oversized == null) {
            oversized = DiscordUtil.overSizeLimits(embedData, charLimit, lineLimit, {
                areas: "body"
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
                areas: "fields"
            })
        ) {
            delete embedData.fields;
        }

        return embedData;
    },

    fetchAttachment: async (msg, responseType = "text", options = {}) => {
        const ctypes = [].concat(options.allowedContentType ?? [], options.allowedContentTypes ?? []);

        const maxSizeKb = Math.round(options.maxSize ?? Infinity),
            maxSize = maxSizeKb * Util.dataBytes.kilobyte;

        const maxSizeError = attachSize =>
            new UtilError(`The attachment can take up at most ${maxSizeKb} kb`, { attachSize, maxSizeKb });

        const attach = msg.file ?? msg.attachments?.at(0),
            url = msg.fileUrl ?? attach?.url;

        if (typeof url !== "string" || Util.empty(url)) {
            throw new UtilError("Message doesn't have any attachments");
        }

        const attachInfo = msg.attachInfo ?? DiscordUtil.parseAttachmentUrl(url),
            contentType = attach?.contentType;

        const [ctypePrefs, extensions] = ArrayUtil.split(ctypes, type => type.startsWith("."));

        if (!Util.empty(extensions)) {
            if (attachInfo == null || Util.empty(attachInfo.ext)) {
                throw new UtilError("Extension can only be validated for attachment URLs");
            } else if (!extensions.includes(attachInfo.ext)) {
                throw new UtilError("Invalid file extension: " + attachInfo.ext, attachInfo.ext);
            }
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

        let res;

        try {
            res = await axios.request({
                url,
                maxContentLength: maxSize,
                responseType
            });
        } catch (err) {
            throw err.message?.startsWith("maxContentLength") ? maxSizeError() : err;
        }

        return { attach, body: res.data, contentType };
    },

    rebindMessage: (msg, client) => {
        const ch_id = msg.channel.id;
        delete msg.channel;

        const channel = client.channels.cache.get(ch_id);
        Object.defineProperty(msg, "channel", { value: channel });
    }
};

{
    DiscordUtil.parseScriptRegex = new RegExp(`^${DiscordUtil.codeblockRegex.source}$`);
}

DiscordUtil = Object.freeze(DiscordUtil);
export default DiscordUtil;
