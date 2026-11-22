import { getClient } from "../LevertClient.js";

import ObjectUtil from "../util/ObjectUtil.js";

class AIRequest {
    static fromCommand(ctx) {
        return new AIRequest({
            author: ctx.author,
            member: ctx.msg.member,
            channel: ctx.channel,
            guild: ctx.guild,
            msg: ctx.msg,
            replyMsg: ctx.replyMsg
        });
    }

    static async fromReaction(msg, user) {
        return new AIRequest({
            author: user,
            member: msg.guild === null ? null : await getClient().fetchMember(msg.guild, user.id),
            channel: msg.channel,
            guild: msg.guild
        });
    }

    constructor(data) {
        data = ObjectUtil.guaranteeObject(data);

        this.author = data.author;
        this.member = data.member ?? null;

        this.channel = data.channel;
        this.guild = data.guild ?? null;

        this.msg = data.msg ?? null;
        this.replyMsg = data.replyMsg ?? null;
    }

    get guildId() {
        return this.guild?.id ?? null;
    }

    get hasMessage() {
        return this.msg !== null;
    }

    get scriptValues() {
        return {
            msg: this.msg,
            replyMsg: this.replyMsg
        };
    }
}

export default AIRequest;
