import AIRequest from "./AIRequest.js";
import AIReplyUpdater from "./AIReplyUpdater.js";
import AIReplyView from "./AIReplyView.js";
import ComponentSession from "../interaction/ComponentSession.js";

import InteractionModes from "../interaction/InteractionModes.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class AIReply {
    static expectedErrors = new Set(["AIError", "AxiosError"]);

    static getHistory(ctx) {
        const turns = [];

        let previous = ctx.previousContext,
            answerMsg = ctx.replyMsg;

        while (previous !== null) {
            turns.unshift(
                { role: "user", text: previous.argsText },
                { role: "model", text: AIReplyView.getAnswerText(answerMsg) }
            );

            answerMsg = previous.replyMsg;
            previous = previous.previousContext;
        }

        return turns;
    }

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
        const aiManager = getClient().aiManager;

        const userId = this.request.author.id;

        if (!aiManager.rateLimiter.check(userId)) {
            const waitTime = aiManager.rateLimiter.getTimeToReset(userId);
            return await this.ctx.reply(this.view.renderCooldown(waitTime), { ephemeral: true });
        }

        await this.updater.start(this.view.renderThinking());

        let result;

        try {
            result = await aiManager.ask(question, this.request, {
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
