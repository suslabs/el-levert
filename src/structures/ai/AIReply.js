import AIRequest from "./AIRequest.js";
import AIReplyUpdater from "./AIReplyUpdater.js";
import AIReplyView from "./AIReplyView.js";
import AIPromptGuard from "../../ai/AIPromptGuard.js";
import ComponentSession from "../interaction/ComponentSession.js";

import InteractionModes from "../interaction/InteractionModes.js";

import { getClient, getConfig } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import AIError from "../../errors/AIError.js";

class AIReply {
    static expectedErrors = new Set(["AIError", "AxiosError"]);

    static getHistory(ctx) {
        const turns = [];

        let previous = ctx.previousContext,
            answerMsg = ctx.replyMsg;

        while (previous !== null) {
            turns.unshift(
                { role: "user", text: previous.argsText },
                {
                    role: "model",
                    text: AIReplyView.getAnswerText(answerMsg),
                    expert: AIReplyView.isExpertAnswer(answerMsg)
                }
            );

            answerMsg = previous.replyMsg;
            previous = previous.previousContext;
        }

        return turns;
    }

    static async handleInteraction(ctx) {
        switch (AIReplyView.getAction(ctx.interaction.customId)) {
            case AIReplyView.followUpAction:
                return await AIReply._handleFollowUp(ctx);
            case AIReplyView.cancelAction:
                return await AIReply._handleCancel(ctx);
            default:
                return false;
        }
    }

    constructor(ctx) {
        this.ctx = ctx;
        this.request = ctx.isInteraction ? AIRequest.fromInteraction(ctx.interaction) : AIRequest.fromCommand(ctx);
        this.replace = ctx.isInteraction && ctx.isAuthor && getConfig().ai.followUpsEditAnswer;

        this.view = new AIReplyView(ctx.isInteraction && !this.replace ? ctx.interaction.user.id : null);
        this.updater = new AIReplyUpdater(ctx, this.replace);

        this.controller = new AbortController();
    }

    get cancelled() {
        return this.controller.signal.aborted;
    }

    async answer(question, history) {
        const aiManager = getClient().aiManager;

        const userId = this.request.author.id,
            isAdmin = await this._isAdmin(userId);

        if (!isAdmin && !aiManager.rateLimiter.check(userId)) {
            const waitTime = aiManager.rateLimiter.getTimeToReset(userId);
            return await this.ctx.reply(this.view.renderCooldown(waitTime), { ephemeral: true });
        }

        const unlimitedTime = isAdmin && aiManager.unlimitedTimeForAdmins;

        if (unlimitedTime) {
            this.ctx.disableTimeout();
        }

        const cancelSession = this._createSession({ reply: this }, InteractionModes.authorOnly);

        try {
            return await this._run(question, history, unlimitedTime ? Infinity : aiManager.timeLimit, cancelSession);
        } finally {
            getClient().interactionHandler.unregisterSession(cancelSession.id);
        }
    }

    async cancel() {
        this.controller.abort();
        await this.updater.close();
    }

    static async _handleFollowUp(ctx) {
        const session = ctx.interactionContext.session,
            question = AIReplyView.getFollowUp(ctx.interaction.customId, session.spec.followUps);

        if (question === null) {
            return false;
        }

        const reply = new AIReply(ctx),
            answer = () => reply.answer(question, session.spec.history);

        if (reply.replace) {
            await answer();
            getClient().interactionHandler.unregisterSession(session.id);
        } else {
            await reply._hideButtonsWhile(session, answer);
        }

        return true;
    }

    static async _handleCancel(ctx) {
        const reply = ctx.interactionContext.session.spec.reply;

        await reply.cancel();
        await ctx.update(reply.view.renderCancelled());

        return true;
    }

    async _isAdmin(userId) {
        const permManager = getClient().permManager;

        let perm = permManager.getLevels().default;

        if (permManager.enabled) {
            perm = await permManager.maxLevel(userId);
        }

        return permManager.allowed(perm, "admin");
    }

    _createSession(spec, interactionMode) {
        const session = new ComponentSession(this.ctx, { interactionMode, spec });

        getClient().interactionHandler.registerSession(session);
        return session;
    }

    _createFollowUpSession(followUps, history) {
        const mode = getConfig().ai.followUpsAnyone ? InteractionModes.anyone : InteractionModes.authorOnly;
        return this._createSession({ followUps, history }, mode);
    }

    async _run(question, history, timeLimit, cancelSession) {
        const aiManager = getClient().aiManager;

        await this.updater.start(this.view.renderThinking(cancelSession));

        let result = null,
            error = null;

        try {
            result = await aiManager.ask(question, this.request, {
                history,
                timeLimit,
                signal: this.controller.signal,
                onProgress: session => this.updater.update(this.view.renderProgress(session, cancelSession))
            });
        } catch (err) {
            if (!this.cancelled && !AIReply.expectedErrors.has(err.name)) {
                this.updater.cancel();
                throw err;
            }

            error = aiManager.promptGuard.contains(err.message) ? new AIError(AIPromptGuard.refusal) : err;
        }

        if (this.cancelled) {
            return null;
        } else if (error !== null) {
            return await this.updater.finish(this.view.renderError(error));
        }

        const turns = [
                ...history,
                { role: "user", text: question },
                { role: "model", text: result.answer, expert: result.expert }
            ],
            session = Util.empty(result.followUps) ? null : this._createFollowUpSession(result.followUps, turns);

        const msg = await this.updater.finish(this.view.renderResult(result, session));
        session?.setMessage(msg);

        return msg;
    }

    async _hideButtonsWhile(session, callback) {
        const hidden = session.message.edit({ components: [] });

        try {
            return await callback();
        } finally {
            await hidden;
            await session.message.edit(this.view.renderFollowUps(session));
        }
    }
}

export default AIReply;
