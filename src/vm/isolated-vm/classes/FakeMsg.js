import FakeUser from "./FakeUser.js";

import VMUtil from "../../../util/vm/VMUtil.js";

const messagesCount = 50;

class FakeMsg {
    constructor(msg) {
        if (msg === null) {
            msg = undefined;
        }

        this.msg = msg;

        if (typeof msg === "undefined") {
            this.fixedMsg = {};
            return this;
        }

        const mentions = msg.mentions,
            channel = msg.channel,
            guild = channel.guild;

        const messageIds = channel.messages.cache.map(msg => msg.id).slice(1, messagesCount + 1);

        this.fixedMsg = VMUtil.removeCircRef({
            channelId: msg.channelId,
            guildId: msg.guildId,
            id: msg.id,
            createdTimestamp: msg.createdTimestamp,
            type: msg.type,
            system: msg.system,
            content: msg.content,
            authorId: msg.author.id,
            pinned: msg.pinned,
            tts: msg.tts,
            nonce: msg.nonce,
            embeds: msg.embeds,
            components: msg.components,
            attachments: Array.from(msg.attachments.values()),
            stickers: Array.from(msg.stickers.values()),
            position: msg.position,
            roleSubscriptionData: msg.roleSubscriptionData,
            editedTimestamp: msg.editedTimestamp,

            mentions: {
                everyone: mentions.everyone,
                users: Array.from(mentions.users.values()),
                roles: Array.from(mentions.roles.values()),
                crosspostedChannels: Array.from(mentions.crosspostedChannels.values()),
                repliedUser: mentions.repliedUser?.id,
                members: Array.from(mentions.members.values()),
                channels: Array.from(mentions.channels.values())
            },

            groupActivityApplicationId: channel.groupActivityApplicationId,
            webhookId: msg.webhookId,
            groupActivityApplicationId: msg.groupActivityApplicationId,
            applicationId: msg.applicationId,
            activity: msg.activity,
            flags: msg.flags.bitfield,
            reference: msg.reference,
            interaction: msg.interaction,
            cleanContent: msg.content,

            channel: {
                type: channel.type,
                flags: channel.flags.bitfield,
                id: channel.id,
                recipientId: channel.recipientId,
                lastPinTimestamp: channel.lastPinTimestamp,
                name: channel.name,
                parentId: channel.parentId,
                topic: channel.topic,
                messages: messageIds,
                lastMessageId: channel.lastMessageId,
                createdTimestamp: channel.createdTimestamp,
                rateLimitPerUser: channel.rateLimitPerUser
            },

            author: new FakeUser(msg.author).fixedUser,

            guild: {
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                banner: guild.banner,
                description: guild.description,
                memberCount: guild.memberCount,
                premiumTier: guild.premiumTier,
                createdTimestamp: guild.createdTimestamp,
                ownerId: guild.ownerId
            }
        });
    }

    static reply(text, msg) {
        const formatted = VMUtil.formatReply(text, msg);
        return JSON.stringify(formatted);
    }
}

export default FakeMsg;
