import FakeUser from "./FakeUser.js";

import DiscordUtil from "../../../util/DiscordUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

class FakeMsg {
    static messageCount = 50;

    constructor(msg, isReply = false, replyMsg = null) {
        this.msg = msg ?? undefined;

        if (typeof this.msg === "undefined") {
            this.fixedMsg = {};
            return this;
        }

        if (msg.fixedMsg != null) {
            this.fixedMsg = msg.fixedMsg;
            return this;
        }

        if (Array.isArray(msg.channel?.messages)) {
            this.fixedMsg = msg;
            return this;
        }

        const mentions = msg.mentions,
            channel = msg.channel,
            guild = channel?.guild;

        const messageIds = channel?.messages?.cache
            ? channel.messages.cache
                  .last(FakeMsg.messageCount)
                  .slice(1)
                  .map(m => m.id)
            : Array.isArray(channel?.messages)
              ? channel.messages
              : [];

        let fixedReplyMsg = null;

        if (!isReply) {
            const reply = replyMsg ?? msg.replyMsg ?? msg.referencedMessage ?? null;

            if (reply !== null) {
                fixedReplyMsg = new FakeMsg(reply, true).fixedMsg;
            }
        }

        const fixedMsg = ObjectUtil.removeCircularReferences({
            channelId: msg.channelId,
            guildId: msg.guildId,
            id: msg.id,
            createdTimestamp: msg.createdTimestamp,
            type: msg.type,
            system: msg.system,
            content: msg.content,
            authorId: msg.author?.id,
            pinned: msg.pinned,
            tts: msg.tts,
            nonce: msg.nonce,
            embeds: msg.embeds
                ? Array.isArray(msg.embeds)
                    ? msg.embeds.map(embed =>
                          typeof embed?.toJSON === "function" ? DiscordUtil.getEmbedData(embed) : embed
                      )
                    : []
                : [],
            components: msg.components,
            attachments: msg.attachments
                ? typeof msg.attachments.values === "function"
                    ? Array.from(msg.attachments.values())
                    : Array.from(msg.attachments)
                : undefined,
            stickers: msg.stickers
                ? typeof msg.stickers.values === "function"
                    ? Array.from(msg.stickers.values())
                    : Array.from(msg.stickers)
                : undefined,
            position: msg.position,
            roleSubscriptionData: msg.roleSubscriptionData,
            editedTimestamp: msg.editedTimestamp,

            mentions: {
                everyone: mentions?.everyone,
                users: mentions?.users
                    ? typeof mentions.users.values === "function"
                        ? Array.from(mentions.users.values())
                        : Array.from(mentions.users)
                    : undefined,
                roles: mentions?.roles
                    ? typeof mentions.roles.values === "function"
                        ? Array.from(mentions.roles.values())
                        : Array.from(mentions.roles)
                    : undefined,
                crosspostedChannels: mentions?.crosspostedChannels
                    ? typeof mentions.crosspostedChannels.values === "function"
                        ? Array.from(mentions.crosspostedChannels.values())
                        : Array.from(mentions.crosspostedChannels)
                    : undefined,
                repliedUser: mentions?.repliedUser?.id,
                members: mentions?.members
                    ? typeof mentions.members.values === "function"
                        ? Array.from(mentions.members.values())
                        : Array.from(mentions.members)
                    : undefined,
                channels: mentions?.channels
                    ? typeof mentions.channels.values === "function"
                        ? Array.from(mentions.channels.values())
                        : Array.from(mentions.channels)
                    : undefined
            },

            webhookId: msg.webhookId,
            groupActivityApplicationId: msg.groupActivityApplicationId,
            applicationId: msg.applicationId,
            activity: msg.activity,
            flags: msg.flags?.bitfield ?? msg.flags,
            reference: msg.reference,
            interaction: msg.interaction,
            cleanContent: msg.content,

            channel: {
                type: channel?.type,
                flags: channel?.flags.bitfield,
                id: channel?.id,
                recipientId: channel?.recipientId,
                lastPinTimestamp: channel?.lastPinTimestamp,
                name: channel?.name,
                parentId: channel?.parentId,
                topic: channel?.topic,
                messages: messageIds,
                lastMessageId: channel?.lastMessageId,
                createdTimestamp: channel?.createdTimestamp,
                rateLimitPerUser: channel?.rateLimitPerUser
            },

            author: new FakeUser(msg.member ?? msg.author).fixedUser,

            guild: {
                id: guild?.id,
                name: guild?.name,
                icon: guild?.icon,
                banner: guild?.banner,
                description: guild?.description,
                memberCount: guild?.memberCount,
                premiumTier: guild?.premiumTier,
                createdTimestamp: guild?.createdTimestamp,
                ownerId: guild?.ownerId
            }
        });

        fixedMsg.replyMsg = fixedReplyMsg;
        fixedMsg.referencedMessage = fixedReplyMsg;

        this.fixedMsg = fixedMsg;
    }
}

export default FakeMsg;
