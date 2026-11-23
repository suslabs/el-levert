import AIEfforts from "../structures/ai/AIEfforts.js";

import ToolParams from "../util/ai/ToolParams.js";

import AIError from "../errors/AIError.js";

class AITriage {
    static schema = ToolParams.object(
        {
            effort: ToolParams.string("How much work the question needs.", { enum: AIEfforts.values })
        },
        ["effort"]
    );

    constructor(instructions) {
        this.instructions = instructions;
    }

    async classify(session, contents) {
        const text = await session.generateText({
            systemInstruction: { parts: [{ text: this.instructions }] },
            contents,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: AITriage.schema
            }
        });

        return AITriage._parse(text);
    }

    static _parse(text) {
        let effort;

        try {
            effort = JSON.parse(text).effort;
        } catch (err) {
            throw new AIError("The model returned an invalid triage", { text, err });
        }

        if (!AIEfforts.has(effort)) {
            throw new AIError(`Unknown effort "${effort}"`, { text });
        }

        return effort;
    }
}

export default AITriage;
