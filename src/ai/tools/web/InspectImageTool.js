import WebTool from "./WebTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ToolParams from "../../../util/ai/ToolParams.js";

class InspectImageTool extends WebTool {
    static info = {
        name: "inspect_image",
        emoji: "👀",
        phase: AIPhases.looking,
        description:
            "Load an image URL and get a factual description. Use ONLY when the answer depends on what an image shows.",
        parameters: ToolParams.object(
            {
                url: ToolParams.string("Image URL, e.g. a Discord attachment URL."),
                question: ToolParams.string("What you need to know about the image.")
            },
            ["url"]
        )
    };

    static quick = true;

    getStatus() {
        return "Looking at the image";
    }

    async execute(args, session) {
        const { url, mimeType, data } = await this.fetchImage(args.url, session);

        const question = Util.nonemptyString(args.question) ? ` Focus on: ${args.question}` : "",
            description = await session.generateText({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { inlineData: { mimeType, data: data.toString("base64") } },
                            { text: getClient().aiManager.prompts.inspectImage + question }
                        ]
                    }
                ]
            });

        return {
            source: url,
            mimeType,
            bytes: data.length,
            description: Util.empty(description) ? "(no description returned)" : description
        };
    }
}

export default InspectImageTool;
