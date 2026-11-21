import AIRequest from "../../ai/AIRequest.js";

import { getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import AIReplyUtil from "../../util/commands/AIReplyUtil.js";

class AskCommand {
    static info = {
        name: "a",
        aliases: ["ai", "ask"],
        category: "ai",
        args: "<question>",
        description:
            "Ask the AI assistant. It can search tags, quests, chat history, server members and the web, run calculations and look at images. Reply to a message or attach an image to ask about it.",
        usage: "- <question>: What you want to know. Follow-up suggestions appear as buttons under the answer.",
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

        await AIReplyUtil.answer(ctx, AIRequest.fromCommand(ctx), question, []);
    }

    async interactionHandler(ctx) {
        return await AIReplyUtil.handleInteraction(ctx);
    }
}

export default AskCommand;
