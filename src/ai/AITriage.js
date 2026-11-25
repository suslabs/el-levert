import AIEfforts from "../structures/ai/AIEfforts.js";

import Util from "../util/Util.js";
import ToolParams from "../util/ai/ToolParams.js";

import AIError from "../errors/AIError.js";

class AITriage {
    static schema = ToolParams.object(
        {
            effort: ToolParams.string("How much work the question needs.", { enum: AIEfforts.values }),
            lookup: ToolParams.string(
                "For a who/what question about something outside the modpack, the name or term to look up. Empty otherwise."
            )
        },
        ["effort", "lookup"]
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
        let data;

        try {
            data = JSON.parse(text);
        } catch (err) {
            throw new AIError("The model returned an invalid triage", { text, err });
        }

        if (!AIEfforts.has(data.effort)) {
            throw new AIError(`Unknown effort "${data.effort}"`, { text });
        }

        const lookup = String(data.lookup ?? "").trim();

        return {
            effort: data.effort,
            lookup: Util.empty(lookup) ? null : lookup
        };
    }
}

export default AITriage;
