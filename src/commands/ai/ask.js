import AIRequest from "../../ai/AIRequest.js";
import AIReply from "../../structures/ai/AIReply.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class AskCommand {
    static info = {
        name: "a",
        aliases: ["ai", "ask"],
        category: "ai",
        args: "<question>",
        description:
            "Ask the AI assistant. It can search tags, quests, chat history, server members and the web, run calculations and look at images. Reply to a message or attach an image to ask about it, or reply to one of its answers to continue the conversation.",
        usage: "- <question>: What you want to know. Follow-up suggestions are numbered; react with the number to ask one.",
        arguments: [
            {
                name: "question",
                kind: "rest"
            }
        ]
    };

    load() {
        if (!getConfig().enableAI) {
            return false;
        }
    }

    async handler(ctx) {
        const question = (ctx.arg("question") ?? "").trim();

        if (Util.empty(question)) {
            return `${getEmoji("info")} ${this.getArgsHelp("question")}`;
        }

        const conversation =
            ctx.replyMsg === null ? null : getClient().followUpHandler.getConversation(ctx.replyMsg.id);

        await new AIReply(AIRequest.fromCommand(ctx), ctx).answer(question, conversation?.history ?? []);
    }
}

export default AskCommand;
