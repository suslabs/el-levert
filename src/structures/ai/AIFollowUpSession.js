import ComponentSession from "../interaction/ComponentSession.js";

import InteractionModes from "../interaction/InteractionModes.js";

import Util from "../../util/Util.js";

class AIFollowUpSession extends ComponentSession {
    static action = "ai_followup";

    constructor(ctx, followUps, history) {
        super(ctx, { interactionMode: InteractionModes.anyone });

        this.followUps = followUps;
        this.history = history;
    }

    getCustomId(idx) {
        return `${AIFollowUpSession.action}:${idx}:${this.id}`;
    }

    getFollowUp(customId) {
        const [action, idxText] = customId.split(":");

        if (action !== AIFollowUpSession.action) {
            return null;
        }

        return this.followUps[Util.parseInt(idxText)] ?? null;
    }
}

export default AIFollowUpSession;
