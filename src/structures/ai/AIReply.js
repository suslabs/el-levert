import AIRequest from "./AIRequest.js";
import AIReplyUpdater from "./AIReplyUpdater.js";
import AIReplyView from "./AIReplyView.js";
import AIFollowUpSession from "./AIFollowUpSession.js";
import AIInteractionTarget from "./AIInteractionTarget.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class AIReply {
    static expectedErrors = new Set(["AIError", "AxiosError"]);

    static fromCommand(ctx) {
        return new AIReply(ctx, AIRequest.fromCommand(ctx), ctx);
    }

    static fromInteraction(ctx) {
        return new AIReply(ctx, AIRequest.fromInteraction(ctx.interaction), new AIInteractionTarget(ctx));
    }

    static async handleFollowUp(ctx) {
        const session = ctx.interactionContext.session,
            question = session.getFollowUp(ctx.interaction.customId);

        if (question === null) {
            return false;
        }

        await AIReply.fromInteraction(ctx).answer(question, session.history);
        return true;
    }

    constructor(ctx, request, target) {
        this.ctx = ctx;
        this.request = request;

        this.view = new AIReplyView();
        this.updater = new AIReplyUpdater(target);
    }

    async answer(question, history) {
        await this.updater.start(this.view.renderThinking());

        let result;

        try {
            result = await getClient().aiManager.ask(question, this.request, {
                history,
                onProgress: session => this.updater.update(this.view.renderProgress(session))
            });
        } catch (err) {
            if (!AIReply.expectedErrors.has(err.name)) {
                this.updater.cancel();
                throw err;
            }

            return await this.updater.finish(this.view.renderError(err));
        }

        const turns = [...history, { role: "user", text: question }, { role: "model", text: result.answer }],
            session = Util.empty(result.followUps) ? null : this._createSession(result.followUps, turns);

        const msg = await this.updater.finish(this.view.renderResult(result, session));
        session?.setMessage(msg);

        return msg;
    }

    _createSession(followUps, history) {
        const session = new AIFollowUpSession(this.ctx, followUps, history);

        getClient().interactionHandler.registerSession(session);
        return session;
    }
}

export default AIReply;
