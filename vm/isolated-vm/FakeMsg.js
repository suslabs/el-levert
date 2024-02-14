import VMUtil from "../../util/VMUtil.js";

class FakeMsg {
    constructor(msg) {
        this.msg = msg;
        
        const attachments = Array.from(msg.attachments.values());
        this.fixedMsg = {
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
            attachments: attachments,
            stickers: msg.stickers,
            position: msg.position,
            roleSubscriptionData: msg.roleSubscriptionData,
            editedTimestamp: msg.editedTimestamp,
            mentions: msg.mentions,
            webhookId: msg.webhookId,
            groupActivityApplicationId: msg.groupActivityApplicationId,
            applicationId: msg.applicationId,
            activity: msg.activity,
            flags: msg.flags,
            reference: msg.reference,
            interaction: msg.interaction,
            cleanContent: msg.content,
            channel: msg.channel,
            author: msg.author
        };
    }

    reply(text, options) {
        const formatted = VMUtil.formatReply(text, options);
        return JSON.stringify(formatted);
    }
}

export default FakeMsg;