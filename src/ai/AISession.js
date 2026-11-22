import AISourceLedger from "../structures/ai/AISourceLedger.js";

import AIPhases from "../structures/ai/AIPhases.js";

import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

import AIError from "../errors/AIError.js";

class AISession {
    static minCallTime = 2 / Util.durationSeconds.milli;

    static getText(parts) {
        return parts
            .filter(part => typeof part.text === "string" && !part.thought)
            .map(part => part.text)
            .join("");
    }

    constructor(manager, request, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.manager = manager;
        this.request = request;

        this.history = options.history ?? [];
        this.onProgress = options.onProgress ?? null;

        this.deadline = Date.now() + (options.timeLimit ?? manager.timeLimit);
        this.state = manager.gemini.createState();

        this.ledger = new AISourceLedger();
        this.contents = [];
        this.files = new Map();
        this.image = null;

        this.steps = [];
        this.text = "";
        this.finishing = false;
    }

    get model() {
        return this.manager.gemini.getModel(this.state);
    }

    get timeLeft() {
        return this.deadline - Date.now();
    }

    get phase() {
        return Util.last(this.steps)?.phase ?? AIPhases.thinking;
    }

    async run(question) {
        const systemInstruction = {
            parts: [{ text: this.manager.prompt.build(this.request, this.manager.tools.getNames(this)) }]
        };

        this.contents = [
            ...this.history.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })),
            { role: "user", parts: [{ text: question }] }
        ];

        for (let i = 0; i < this.manager.maxSteps; i++) {
            if (this.timeLeft < AISession.minCallTime) {
                throw new AIError("Ran out of time", { steps: this.steps.length });
            }

            const final = i === this.manager.maxSteps - 1 || this.timeLeft < this.manager.requestTimeout,
                res = await this._stream(this._buildRequest(systemInstruction, final), final);

            const calls = res.parts
                .filter(part => typeof part.functionCall !== "undefined")
                .map(part => ({ ...part.functionCall, args: ObjectUtil.guaranteeObject(part.functionCall.args) }));

            if (Util.empty(calls)) {
                return await this._finish(question, res.finishReason);
            }

            this.contents.push({ role: "model", parts: res.parts });
            this.contents.push({ role: "user", parts: await this._runCalls(calls) });
        }

        throw new AIError("Ran out of steps", { steps: this.steps.length });
    }

    async generateText(body) {
        const data = await this.manager.gemini.generate(body, this.state, { timeLeft: this.timeLeft }),
            parts = Util.first(data.candidates ?? [])?.content?.parts ?? [];

        return AISession.getText(parts).trim();
    }

    toolTimeout() {
        return Util.clamp(
            this.timeLeft - this.manager.requestTimeout,
            AISession.minCallTime,
            this.manager.requestTimeout
        );
    }

    logError(toolName, err) {
        getLogger().error(`AI tool "${toolName}" failed:`, err);
    }

    static _createResponse(call, res) {
        return {
            functionResponse: {
                ...(typeof call.id === "undefined" ? {} : { id: call.id }),
                name: call.name,
                response: res
            }
        };
    }

    _buildRequest(systemInstruction, final) {
        return {
            systemInstruction,
            contents: this.contents,
            tools: [{ functionDeclarations: this.manager.tools.getDeclarations(this) }],
            toolConfig: { functionCallingConfig: { mode: final ? "NONE" : "AUTO" } }
        };
    }

    async _stream(body, final) {
        return await this.manager.gemini.stream(body, this.state, {
            timeLeft: this.timeLeft,
            thinkingLevel: final ? this.manager.thinkingLevel : this.manager.toolThinkingLevel,
            onParts: parts => this._appendText(AISession.getText(parts)),
            onRestart: () => this._resetText()
        });
    }

    async _appendText(text) {
        if (Util.empty(text)) {
            return;
        }

        this.text += text;
        await this._reportProgress();
    }

    async _resetText() {
        this.text = "";
        await this._reportProgress();
    }

    async _runCalls(calls) {
        const steps = calls.map(call => this.manager.tools.createStep(call.name, call.args, this));

        this.text = "";
        this.steps.push(...steps);

        await this._reportProgress();
        return await Promise.all(calls.map(call => this._runCall(call)));
    }

    async _runCall(call) {
        const res = await this.manager.tools.execute(call.name, call.args, this);
        this.ledger.record(res);

        return AISession._createResponse(call, res);
    }

    async _finish(question, finishReason) {
        const answer = this.text.trim();

        if (Util.empty(answer)) {
            const reason = finishReason ?? "empty response";
            throw new AIError(`The model returned no answer (${reason})`, { reason });
        }

        this.finishing = true;
        await this._reportProgress();

        const extras = await this._getExtras(question, answer);

        return {
            answer,
            ...extras,
            files: Array.from(this.files, ([name, content]) => ({ name, content })),
            image: this.image,
            models: this.state.models,
            tokens: this.state.tokens,
            reasoning: this.state.reasoning
        };
    }

    async _getExtras(question, answer) {
        try {
            return await this.manager.finisher.finish(this, question, answer);
        } catch (err) {
            if (err.name !== "AIError") {
                throw err;
            }

            getLogger().warn(`Couldn't add sources and follow-ups to an AI answer: ${err.message}`);
            return { followUps: [], sources: [] };
        }
    }

    async _reportProgress() {
        if (typeof this.onProgress !== "function") {
            return;
        }

        await this.onProgress(this);
    }
}

export default AISession;
