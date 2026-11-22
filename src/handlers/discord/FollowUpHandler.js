import Handler from "../Handler.js";
import ConversationTracker from "./tracker/ConversationTracker.js";

import AIRequest from "../../ai/AIRequest.js";
import AIReply from "../../structures/ai/AIReply.js";
import AIMessageTarget from "../../structures/ai/AIMessageTarget.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class FollowUpHandler extends Handler {
    static $name = "followUpHandler";

    handlesMessages = false;

    constructor(enabled, options) {
        options = ObjectUtil.guaranteeObject(options);
        super(enabled, options);

        const sweepInterval = options.sweepInterval ?? 30 / Util.durationSeconds.milli;
        this.tracker = new ConversationTracker(sweepInterval);
    }

    register(conversation) {
        return this.tracker.addConversation(conversation);
    }

    getConversation(id) {
        return this.tracker.getConversation(id);
    }

    async execute(reaction, user) {
        const conversation = this.tracker.getConversation(reaction.message.id);

        if (conversation === null || conversation.busy) {
            return false;
        }

        const num = DiscordUtil.parseKeycapEmoji(reaction.emoji.name),
            question = num === null ? null : conversation.getFollowUp(num);

        if (question === null) {
            return false;
        }

        conversation.busy = true;
        conversation.touch();

        try {
            await this._removeReaction(reaction, user);

            const request = await AIRequest.fromReaction(conversation.msg, user);
            await new AIReply(request, new AIMessageTarget(conversation.msg)).answer(question, conversation.history);
        } finally {
            conversation.busy = false;
        }

        return true;
    }

    unload() {
        this.tracker.destroy();
    }

    async _removeReaction(reaction, user) {
        try {
            await reaction.users.remove(user.id);
        } catch (err) {
            getLogger().warn("Couldn't remove follow-up reaction (missing Manage Messages permission?):", err);
        }
    }
}

export default FollowUpHandler;
