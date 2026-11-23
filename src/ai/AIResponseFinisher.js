import ToolParams from "./tools/ToolParams.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";

import AIError from "../errors/AIError.js";

class AIResponseFinisher {
    static minFollowUps = 3;
    static maxFollowUps = 5;
    static maxFollowUpLength = 80;

    static maxSources = 3;
    static maxCandidates = 40;

    static schema = ToolParams.object(
        {
            followUps: ToolParams.stringArray("Next questions.", {
                minItems: AIResponseFinisher.minFollowUps,
                maxItems: AIResponseFinisher.maxFollowUps
            }),
            sources: ToolParams.stringArray("Exact candidate sources.")
        },
        ["followUps", "sources"]
    );

    constructor(instructions) {
        this.instructions = instructions;
    }

    async finish(session, question, answer) {
        const candidates = session.ledger.toArray().slice(0, AIResponseFinisher.maxCandidates);

        const text = await session.generateText({
            systemInstruction: { parts: [{ text: this.instructions }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify({ question, answer, candidates }) }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: AIResponseFinisher.schema
            }
        });

        const out = AIResponseFinisher._parse(text);

        return {
            followUps: AIResponseFinisher._cleanList(out.followUps)
                .slice(0, AIResponseFinisher.maxFollowUps)
                .map(followUp =>
                    AIResponseFinisher._formatFollowUp(Util.trimString(followUp, AIResponseFinisher.maxFollowUpLength))
                ),

            sources: AIResponseFinisher._cleanList(out.sources)
                .filter(source => session.ledger.has(source))
                .slice(0, AIResponseFinisher.maxSources)
        };
    }

    static _endPunctuationRegex = /[.?!]$/;

    static _formatFollowUp(followUp) {
        const question = Util.capitalize(followUp);
        return AIResponseFinisher._endPunctuationRegex.test(question) ? question : `${question}?`;
    }

    static _parse(text) {
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new AIError("The model returned invalid follow-ups", { text, err });
        }
    }

    static _cleanList(list) {
        const items = ArrayUtil.guaranteeArray(list, null, true).map(item => String(item).trim());
        return ArrayUtil.unique(items.filter(Util.nonemptyString));
    }
}

export default AIResponseFinisher;
