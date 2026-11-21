import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import Util from "../../util/Util.js";

class FinalResponseTool extends AITool {
    static info = {
        name: "final_response",
        description:
            "Deliver the answer. Call exactly once, alone (never in parallel with other tools), after any needed tool calls.",
        parameters: ToolParams.object(
            {
                finalAnswer: ToolParams.string(
                    "Concise synthesis in Discord markdown, under ~1500 characters. Paraphrase evidence; no raw tool output. Address users with <@id>."
                ),
                followUps: ToolParams.stringArray(
                    "1-3 short next questions (under 70 characters each). Empty only for acknowledgments, terminal answers, direct transformations, or when asked for none."
                ),
                sources: ToolParams.stringArray(
                    'Best 1-3 exact "source" values or URLs from this turn\'s tool output. Never invent. Empty only if no retrieval was used.'
                ),
                image: ToolParams.string("Optional image URL from tool output.")
            },
            ["finalAnswer", "followUps", "sources"]
        )
    };

    static maxFollowUps = 3;
    static maxFollowUpLength = 80;

    static maxSources = 3;

    execute(args, session) {
        const answer = String(args.finalAnswer ?? "").trim();

        const followUps = this._cleanList(args.followUps)
            .slice(0, FinalResponseTool.maxFollowUps)
            .map(followUp => Util.trimString(followUp, FinalResponseTool.maxFollowUpLength));

        const sources = this._cleanList(args.sources)
            .filter(source => session.ledger.has(source))
            .slice(0, FinalResponseTool.maxSources);

        const image = String(args.image ?? "").trim(),
            validImage = FinalResponseTool._urlRegex.test(image) && session.ledger.has(image);

        return {
            answer: Util.empty(answer) ? "I couldn't produce an answer." : answer,
            followUps,
            sources,
            image: validImage ? image : null
        };
    }

    static _urlRegex = /^https?:\/\//i;

    _cleanList(list) {
        return (Array.isArray(list) ? list : [])
            .map(item => String(item ?? "").trim())
            .filter(item => !Util.empty(item));
    }
}

export default FinalResponseTool;
