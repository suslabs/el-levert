import { Buffer } from "node:buffer";

import axios from "axios";

import { ChannelType, AttachmentBuilder } from "discord.js";

import Util from "./Util.js";
import ArrayUtil from "./ArrayUtil.js";

import UtilError from "../errors/UtilError.js";

let DiscordUtil = {
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
