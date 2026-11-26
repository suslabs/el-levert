import AIRequest from "./AIRequest.js";
import AIReplyUpdater from "./AIReplyUpdater.js";
import AIReplyView from "./AIReplyView.js";
import AIPromptGuard from "../../ai/AIPromptGuard.js";
import ComponentSession from "../interaction/ComponentSession.js";

import InteractionModes from "../interaction/InteractionModes.js";

import { getClient, getConfig, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import AIError from "../../errors/AIError.js";

function findFollowUp(args, followUps) {
    const idx = Util.parseInt(Util.first(args));
    return followUps[idx] ?? null;
}

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
        const { componentId, session } = ctx.interactionContext;

        if (componentId.prefix !== AIReplyView.customIdPrefix) {
            return false;
        }

        const { action } = session.spec;

        if (componentId.action !== action) {
            return false;
        }

        switch (action) {
            case AIReplyView.followUpAction:
                if (getClient().checkComponent("managers", "aiManager", { throwErrors: false, altName: "AI" })) {
                    await ctx.reply(`${getEmoji("error")} AI is currently unavailable.`, { ephemeral: true });
                    return true;
                }

                return await AIReply._handleFollowUp(ctx, findFollowUp(componentId.args, session.spec.followUps));
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

        const cancelSession = this._createSession(
            { action: AIReplyView.cancelAction, reply: this },
            InteractionModes.authorOnly
        );

        try {
            return await this._run(question, history, unlimitedTime ? -1 : aiManager.timeLimit, cancelSession);
        } finally {
            getClient().interactionHandler.unregisterSession(cancelSession.id);
        }
    }

    async cancel() {
        this.controller.abort();
        await this.updater.close();
    }

    static async _handleFollowUp(ctx, question) {
        if (question === null) {
            return false;
        }

        const { session } = ctx.interactionContext;

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

    _createFollowUpSession(result, question, history) {
        if (Util.empty(result.followUps)) {
            return null;
        }

        const turns = [
            ...history,
            { role: "user", text: question },
            { role: "model", text: result.answer, expert: result.expert }
        ];

        const mode = getConfig().ai.followUpsAnyone ? InteractionModes.anyone : InteractionModes.authorOnly;
        return this._createSession(
            { action: AIReplyView.followUpAction, followUps: result.followUps, history: turns },
            mode
        );
    }

    async _run(question, history, timeLimit, cancelSession) {
        const aiManager = getClient().aiManager;

        await this.updater.start(this.view.renderThinking(cancelSession));

        let result;

        try {
            result = await aiManager.ask(question, this.request, {
                history,
                timeLimit,
                signal: this.controller.signal,
                onProgress: session => this.updater.update(this.view.renderProgress(session, cancelSession))
            });
        } catch (err) {
            if (this.cancelled) {
                return null;
            }

            if (!AIReply.expectedErrors.has(err.name)) {
                getLogger().error(`AI answer failed (${LoggerUtil.formatErrorSummary(err, aiManager.redactLogText)}).`);
                err = new AIError("The AI could not finish this answer");
            } else if (aiManager.promptGuard.contains(err.message)) {
                err = new AIError(AIPromptGuard.refusal);
            }

            return await this.updater.finish(this.view.renderError(err));
        }

        if (this.cancelled) {
            return null;
        }

        const session = this._createFollowUpSession(result, question, history),
            msg = await this.updater.finish(this.view.renderResult(result, session));
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
