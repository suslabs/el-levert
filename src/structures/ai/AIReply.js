import AIRequest from "./AIRequest.js";
import AIReplyUpdater from "./AIReplyUpdater.js";
import AIReplyView from "./AIReplyView.js";
import ComponentSession from "../interaction/ComponentSession.js";

import InteractionModes from "../interaction/InteractionModes.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class AIReply {
    static expectedErrors = new Set(["AIError", "AxiosError"]);

    static async handleFollowUp(ctx) {
        const session = ctx.interactionContext.session,
            question = AIReplyView.getFollowUp(ctx.interaction.customId, session.spec.followUps);

        if (question === null) {
            return false;
        }

        await new AIReply(ctx).answer(question, session.spec.history);
        return true;
    }

    constructor(ctx) {
        this.ctx = ctx;
        this.request = ctx.isInteraction ? AIRequest.fromInteraction(ctx.interaction) : AIRequest.fromCommand(ctx);

        this.view = new AIReplyView();
        this.updater = new AIReplyUpdater(ctx);
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
        const session = new ComponentSession(this.ctx, {
            interactionMode: InteractionModes.anyone,
            spec: { followUps, history }
        });

        getClient().interactionHandler.registerSession(session);
        return session;
    }
}

export default AIReply;
