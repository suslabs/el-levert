import AIReply from "../../structures/ai/AIReply.js";

import { getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class AskCommand {
    static info = {
        name: "a",
        aliases: ["ai", "ask"],
        category: "ai",
        continueOnReply: true,
        args: "<question>",
        description:
            "Ask the AI assistant. It can search tags, recipes, chat history, server members and the web, run calculations and look at images. Reply to a message or attach an image to ask about it.",
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

        await new AIReply(ctx).answer(question, AIReply.getHistory(ctx));
    }

    async interactionHandler(ctx) {
        return await AIReply.handleFollowUp(ctx);
    }
}

export default AskCommand;
