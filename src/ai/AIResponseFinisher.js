import ToolParams from "./tools/ToolParams.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";

import AIError from "../errors/AIError.js";

class AIResponseFinisher {
    static maxFollowUps = 3;
    static maxFollowUpLength = 80;

    static maxSources = 3;
    static maxCandidates = 40;

    static instructions = `You finish a Discord assistant's answer. You get the user's question, the assistant's answer and the candidate sources its tools returned. Reply with JSON:
- followUps: 1-3 short questions (under 70 characters each) the user is likely to ask next, phrased as the user would type them. Empty only for greetings, thanks, acknowledgments or answers that leave nothing to follow up on.
- sources: the 1-3 candidate sources that best support the answer, copied exactly from the candidates. Empty when no candidate supports it.`;

    static schema = ToolParams.object(
        {
            followUps: ToolParams.stringArray("Next questions."),
            sources: ToolParams.stringArray("Exact candidate sources.")
        },
        ["followUps", "sources"]
    );

    async finish(session, question, answer) {
        const candidates = session.ledger.toArray().slice(0, AIResponseFinisher.maxCandidates);

        const text = await session.generateText({
            systemInstruction: { parts: [{ text: AIResponseFinisher.instructions }] },
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
                .map(followUp => Util.trimString(followUp, AIResponseFinisher.maxFollowUpLength)),

            sources: AIResponseFinisher._cleanList(out.sources)
                .filter(source => session.ledger.has(source))
                .slice(0, AIResponseFinisher.maxSources)
        };
    }

    static _parse(text) {
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new AIError("The model returned invalid follow-ups", { text, err });
        }
    }

    static _cleanList(list) {
        const items = (Array.isArray(list) ? list : []).map(item => String(item ?? "").trim());
        return ArrayUtil.unique(items.filter(item => !Util.empty(item)));
    }
}

export default AIResponseFinisher;
