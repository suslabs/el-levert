import AITool from "./AITool.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import AIError from "../../errors/AIError.js";

class MessageHistoryTool extends AITool {
    static pageSize = 100;
    static maxContentLength = 500;

    async fetchHistory(session, options) {
        const request = session.request,
            channelId = this._resolveChannelId(String(options.channelId ?? "")) ?? request.channel.id;

        const msgs = [];
        let before = options.before;

        for (let i = 0; i < options.pages; i++) {
            const batch = await getClient().fetchMessages(
                channelId,
                { checkAccess: true, user_id: request.author.id },
                { limit: options.pageSize, before }
            );

            if (batch === null) {
                throw new AIError("That channel can't be read (it doesn't exist, or you can't access it)", channelId);
            }

            const sorted = Array.from(batch.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            msgs.push(...sorted.filter(msg => msg.id !== request.msg?.id));

            if (sorted.length < options.pageSize) {
                break;
            }

            before = Util.last(sorted).id;
        }

        return msgs;
    }

    formatMessage(msg) {
        return {
            id: msg.id,
            source: msg.url,
            author: {
                id: msg.author.id,
                mention: `<@${msg.author.id}>`,
                name: msg.member?.displayName ?? msg.author.username,
                bot: msg.author.bot
            },
            createdAt: msg.createdAt.toISOString(),
            content: Util.trimString(msg.content, MessageHistoryTool.maxContentLength),
            attachments: Array.from(msg.attachments.values()).map(attach => attach.url)
        };
    }

    parseUserId(id) {
        return Util.first(DiscordUtil.findUserIds(String(id ?? ""))) ?? null;
    }

    _resolveChannelId(text) {
        return Util.first(DiscordUtil.findChannelIds(text)) ?? Util.first(DiscordUtil.findUserIds(text)) ?? null;
    }
}

export default MessageHistoryTool;
