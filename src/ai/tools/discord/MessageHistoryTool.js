import { userMention } from "discord.js";

import AITool from "../AITool.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import DiscordUtil from "../../../util/DiscordUtil.js";

import AIError from "../../../errors/AIError.js";

class MessageHistoryTool extends AITool {
    static pageSize = 100;
    static maxContentLength = 500;

    async fetchHistory(session, options) {
        options = ObjectUtil.guaranteeObject(options);

        const pages = options.pages ?? 1,
            pageSize = options.pageSize ?? MessageHistoryTool.pageSize;

        const request = session.request,
            channelId = this.resolveChannelId(options.channelId) ?? request.channel.id;

        const msgs = [];

        let before = options.before;

        for (let i = 0; i < pages; i++) {
            const batch = await getClient().fetchMessages(
                channelId,
                { checkAccess: true, user_id: request.author.id },
                { limit: pageSize, before }
            );

            if (batch === null) {
                throw new AIError("That channel can't be read (it doesn't exist, or you can't access it)", channelId);
            }

            const sorted = Array.from(batch.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            msgs.push(...sorted.filter(msg => msg.id !== request.msg?.id));

            if (sorted.length < pageSize) {
                break;
            }

            before = Util.last(sorted).id;
        }

        return msgs;
    }

    async formatMessages(msgs) {
        const urls = [];

        for (const msg of msgs) {
            for (const info of DiscordUtil.findAttachmentUrls(msg.content ?? "")) {
                if (DiscordUtil.isAttachmentExpired(info)) {
                    urls.push(DiscordUtil.normalizeAttachmentUrl(info.prefix + info.search));
                }
            }

            for (const url of DiscordUtil.getAttachmentUrls(msg)) {
                if (DiscordUtil.isAttachmentUrl(url) && DiscordUtil.isAttachmentExpired(url)) {
                    urls.push(DiscordUtil.normalizeAttachmentUrl(url));
                }
            }
        }

        const uniqueUrls = ArrayUtil.unique(urls),
            resolved = new Map();

        if (!Util.empty(uniqueUrls)) {
            const refreshed = await getClient().refreshAttachmentUrls(uniqueUrls);

            for (let i = 0; i < uniqueUrls.length; i++) {
                resolved.set(uniqueUrls[i], refreshed[i]);
            }
        }

        return msgs.map(msg => this.formatMessage(msg, resolved));
    }

    formatMessage(msg, resolvedUrls = null) {
        let content = msg.content ?? "";

        if (resolvedUrls !== null && DiscordUtil.hasAttachmentUrls(content)) {
            DiscordUtil.attachUrlRegex.lastIndex = 0;

            content = content.replace(DiscordUtil.attachUrlRegex, match => {
                const normalized = DiscordUtil.normalizeAttachmentUrl(match);
                return resolvedUrls.get(normalized) ?? match;
            });
        }

        const attachments = DiscordUtil.getAttachmentUrls(msg).map(url => {
            if (resolvedUrls === null) {
                return url;
            }

            const normalized = DiscordUtil.normalizeAttachmentUrl(url);
            return resolvedUrls.get(normalized) ?? url;
        });

        return {
            id: msg.id,
            source: msg.url,
            channelId: msg.channelId,
            author: {
                id: msg.author.id,
                mention: userMention(msg.author.id),
                name: msg.member?.displayName ?? msg.author.username,
                bot: msg.author.bot
            },
            createdAt: msg.createdAt.toISOString(),
            content: Util.trimString(content, MessageHistoryTool.maxContentLength),
            attachments
        };
    }

    resolveChannelId(id) {
        const text = String(id ?? "");
        return Util.first(DiscordUtil.findChannelIds(text)) ?? Util.first(DiscordUtil.findUserIds(text)) ?? null;
    }

    parseUserId(id) {
        return Util.first(DiscordUtil.findUserIds(String(id ?? ""))) ?? null;
    }
}

export default MessageHistoryTool;
