import { Buffer } from "node:buffer";

import axios from "axios";

import { ChannelType, AttachmentBuilder } from "discord.js";

import Util from "./Util.js";
import TypeTester from "./TypeTester.js";
import ArrayUtil from "./ArrayUtil.js";

import UtilError from "../errors/UtilError.js";

let DiscordUtil = {
    msgCharLimit: 2000,
    embedCharLimit: 4096,

    codeblockRegex: /(?<!\\)(?:`{3}([\S]+\n)?([\s\S]*?)`{3}|`([^`\n]+)`)/g,

    findCodeblocks: str => {
        const matches = str.matchAll(DiscordUtil.codeblockRegex);
        return Array.from(matches).map(match => [match.index, match.index + match[0].length]);
    },

    parseScript: script => {
        const match = script.match(DiscordUtil.parseScriptRegex);

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

    getFileAttach: (data, name = "message.txt") => {
        const attachment = new AttachmentBuilder(Buffer.from(data), { name });

        return {
            files: [attachment]
        };
    },

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
        const inDms = channel.type === ChannelType.DM;

        if (inDms) {
            return "DMs";
        }

        const inThread = [ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type);

        if (inThread) {
            return `"${channel.name}" (thread of parent channel #${channel.parent.name})`;
        } else {
            return `#${channel.name}`;
        }
    },

    getEmbed: embed => {
        return embed?.data ?? embed;
    },

    stringifyEmbed: (embed, options = {}) => {
        const useHeaders = options.headers ?? false,
            includeURLs = options.urls ?? true;

        embed = DiscordUtil.getEmbed(embed);

        if (embed == null) {
            return "";
        }

        let blocks = [];

        const titleParts = [],
            bodyParts = [],
            fieldParts = [],
            footerParts = [];

        if (!Util.empty(embed.author?.name)) {
            let icon = "";

            if (includeURLs && !Util.empty(embed.author.icon_url)) {
                icon = `(${embed.author.icon_url}) `;
            }

            titleParts.push(`${icon}${embed.author.name}`.trim());
        }

        if (!Util.empty(embed.title)) {
            let url = "";

            if (includeURLs && !Util.empty(embed.url)) {
                url = ` (${embed.url})`;
            }

            titleParts.push(`${embed.title}${url}`);
        }

        if (useHeaders) {
            titleParts.unshift("[Title]");
            titleParts.push("---");
        }

        blocks.push(titleParts.join("\n"));

        if (includeURLs && !Util.empty(embed.thumbnail?.url)) {
            bodyParts.push(`(${embed.thumbnail.url})`);
        }

        if (!Util.empty(embed.description)) {
            bodyParts.push(embed.description);
        }

        if (includeURLs && !Util.empty(embed.image?.url)) {
            bodyParts.push(`(${embed.image.url})`);
        }

        if (useHeaders) {
            bodyParts.unshift("[Body]");
            bodyParts.push("---");
        }

        blocks.push(bodyParts.join("\n"));

        if (!Util.empty(embed.fields)) {
            embed.fields.forEach((field, i) => {
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

        if (!Util.empty(embed.footer?.text)) {
            let icon = "";

            if (includeURLs && !Util.empty(embed.footer.icon_url)) {
                icon = `(${embed.footer.icon_url}) `;
            }

            footerParts.push(`${icon}${embed.footer.text}`.trim());
        }

        if (!Util.empty(embed.timestamp)) {
            footerParts.push(`At ${embed.timestamp}`);
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

        embed = DiscordUtil.getEmbed(embed);

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

        if (countAreas === "all") {
            countAreas = DiscordUtil._countAreas;
        } else {
            if (!Array.isArray(countAreas)) {
                countAreas = [countAreas];
            }

            if (!countAreas.every(area => DiscordUtil._countAreas.includes(area))) {
                throw new UtilError("Invalid count areas");
            }
        }

        if (countAreas.includes("content")) {
            size += count(embed.title);
            size += count(embed.description);
        } else if (countAreas.includes("body")) {
            size += count(embed.description);
        }

        if (countAreas.includes("details")) {
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
        }

        if (!countAreas.includes("fields")) {
            return size;
        }

        const fieldsSize = (embed.fields ?? []).reduce((sum, field, i) => {
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

    markdownTrimString(str, charLimit, lineLimit, options = {}) {},

    trimEmbed(embed, charLimit, lineLimit, options = {}) {
        const orig = embed;
        embed = DiscordUtil.getEmbed(embed);

        let oversized = options.oversized;

        if (oversized == null) {
            oversized = DiscordUtil.overSizeLimits(embed, charLimit, lineLimit, {
                areas: "body"
            });
        }

        if (oversized) {
            embed.description = Util.trimString(embed.description, charLimit, lineLimit, {
                ...options,
                oversized
            });
        }

        if (
            DiscordUtil.overSizeLimits(embed, charLimit, lineLimit, {
                areas: "fields"
            })
        ) {
            delete embed.fields;
        }

        return orig;
    },

    fetchAttachment: async (msg, responseType = "text", options = {}) => {
        const contentTypes = [].concat(options.allowedContentTypes ?? []),
            maxSize = (options.maxSize ?? Infinity) * 1024;

        let attach;

        if (typeof msg.file !== "undefined") {
            attach = msg.file;
        } else if (!Util.empty(msg.attachments)) {
            attach = msg.attachments.at(0);
        }

        const url = msg.fileUrl ?? attach?.url;

        if (typeof url === "undefined") {
            throw new UtilError("Message doesn't have any attachments");
        }

        const attachInfo = msg.attachInfo ?? DiscordUtil.parseAttachmentUrl(url),
            contentType = attach?.contentType;

        const [extensions, ctPrefixes] = ArrayUtil.split(contentTypes, type => type.startsWith("."));

        if (!Util.empty(extensions)) {
            if (typeof attachInfo === "undefined") {
                throw new UtilError("Extension can only be validated for attachment URLs");
            }

            if (!extensions.includes(attachInfo.ext)) {
                throw new UtilError("Invalid file extension: " + attachInfo.ext);
            }
        }

        if (!Util.empty(ctPrefixes)) {
            if (typeof contentType === "undefined") {
                throw new UtilError("Attachment doesn't have a content type");
            }

            if (!Util.hasPrefix(ctPrefixes, contentType)) {
                throw new UtilError("Invalid content type: " + contentType);
            }
        }

        if (attach?.size > maxSize) {
            throw new UtilError(`The attachment can take up at most ${maxSize} kb`);
        }

        const res = await axios.request({
            url,
            responseType
        });

        return res.data;
    }
};

{
    DiscordUtil.parseScriptRegex = new RegExp(`^${DiscordUtil.codeblockRegex.source}$`);
}

DiscordUtil = Object.freeze(DiscordUtil);
export default DiscordUtil;
