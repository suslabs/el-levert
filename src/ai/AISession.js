import AISourceLedger from "../structures/ai/AISourceLedger.js";

import AIPhases from "../structures/ai/AIPhases.js";
import AIEfforts from "../structures/ai/AIEfforts.js";

import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import AIUtil from "../util/ai/AIUtil.js";

import AIError from "../errors/AIError.js";

class AISession {
    static minCallTime = 2 / Util.durationSeconds.milli;

    static maxFiles = 10;
    static maxImages = 4;

    static toolMode = "AUTO";
    static answerMode = "NONE";

    constructor(manager, request, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.manager = manager;
        this.request = request;

        this.history = options.history ?? [];
        this.onProgress = options.onProgress ?? null;
        this.signal = options.signal ?? null;

        this.startTime = Date.now();
        this.deadline = this.startTime + (options.timeLimit ?? manager.timeLimit);
        this.state = manager.gemini.createState();
        this.effort = AIEfforts.research;

        this.ledger = new AISourceLedger();
        this.contents = [];
        this.files = new Map();
        this.images = [];

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

    get maxSteps() {
        return this.effort === AIEfforts.quick ? this.manager.quickMaxSteps : this.manager.maxSteps;
    }

    async run(question) {
        this.contents = [
            ...this.history.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })),
            { role: "user", parts: [{ text: question }] }
        ];

        this.effort = await this._triage();
        this._checkCancelled();

        const prompt = this.manager.prompt.build(this.request, this.manager.tools.getNames(this), this.effort),
            systemInstruction = { parts: [{ text: prompt }] };

        for (let i = 0; i < this.maxSteps; i++) {
            this._checkCancelled();

            if (this.timeLeft < AISession.minCallTime) {
                throw new AIError("Ran out of time", { steps: this.steps.length });
            }

            const stepStart = Date.now();

            const final = i === this.maxSteps - 1 || this.timeLeft < this.manager.requestTimeout;

            const res = await this._stream(this._buildRequest(systemInstruction, final), final),
                calls = AISession._getCalls(res.parts);

            this._logStep(i, stepStart, calls);

            if (Util.empty(calls)) {
                return await this._finish(question, res.finishReason);
            }

            this.contents.push({ role: "model", parts: res.parts });
            this.contents.push({ role: "user", parts: await this._runCalls(calls) });
        }

        throw new AIError("Ran out of steps", { steps: this.steps.length });
    }

    async generateText(body) {
        const data = await this.manager.gemini.generate(body, this.state, {
            timeLeft: this.timeLeft,
            signal: this.signal
        });

        const parts = Util.first(data.candidates ?? [])?.content?.parts ?? [];

        return AIUtil.getText(parts).trim();
    }

    toolTimeout() {
        return Util.clamp(
            this.timeLeft - this.manager.requestTimeout,
            AISession.minCallTime,
            this.manager.requestTimeout
        );
    }

    attachFile(name, content) {
        if (!this.files.has(name) && this.files.size >= AISession.maxFiles) {
            throw new AIError(`At most ${AISession.maxFiles} files can be attached`);
        }

        this.files.set(name, content);
    }

    showImage(url) {
        if (this.images.includes(url)) {
            return;
        } else if (this.images.length >= AISession.maxImages) {
            throw new AIError(`At most ${AISession.maxImages} images can be shown`);
        }

        this.images.push(url);
    }

    logError(toolName, err) {
        getLogger().error(`AI tool "${toolName}" failed:`, err);
    }

    static _getCalls(parts) {
        return parts
            .filter(part => typeof part.functionCall !== "undefined")
            .map(part => ({ ...part.functionCall, args: ObjectUtil.guaranteeObject(part.functionCall.args) }));
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

    async _triage() {
        const startTime = Date.now();

        try {
            const effort = await this.manager.triage.classify(this, this.contents);
            getLogger().debug(`AI question sorted as ${effort} in ${AIUtil.formatElapsed(startTime)}.`);

            return effort;
        } catch (err) {
            if (err.name !== "AIError" || this.signal?.aborted) {
                throw err;
            }

            getLogger().warn(`Couldn't sort an AI question by effort: ${err.message}`);
            return AIEfforts.research;
        }
    }

    _buildRequest(systemInstruction, final) {
        return {
            systemInstruction,
            contents: this.contents,
            tools: [{ functionDeclarations: this.manager.tools.getDeclarations(this) }],
            toolConfig: { functionCallingConfig: { mode: final ? AISession.answerMode : AISession.toolMode } }
        };
    }

    async _stream(body, final) {
        return await this.manager.gemini.stream(body, this.state, {
            timeLeft: this.timeLeft,
            signal: this.signal,
            thinkingLevel: final ? this.manager.thinkingLevel : this.manager.toolThinkingLevel,
            onParts: parts => this._appendText(AIUtil.getText(parts)),
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

    _logStep(i, startTime, calls) {
        const action = Util.empty(calls) ? "wrote the answer" : `called ${calls.map(call => call.name).join(", ")}`;
        getLogger().debug(`AI step ${i + 1} on ${this.model} took ${AIUtil.formatElapsed(startTime)} and ${action}.`);
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

        const extrasStart = Date.now();

        const extras = await this._getExtras(question, answer);

        getLogger().debug(`AI sources and follow-ups took ${AIUtil.formatElapsed(extrasStart)}.`);
        this._checkCancelled();

        getLogger().debug(
            `AI answer took ${AIUtil.formatElapsed(this.startTime)} over ${this.steps.length} tool call(s).`
        );

        return {
            answer,
            ...extras,
            files: Array.from(this.files, ([name, content]) => ({ name, content })),
            images: this.images,
            models: this.state.models,
            tokens: this.state.tokens,
            reasoning: this.state.reasoning,
            elapsed: Date.now() - this.startTime
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

    _checkCancelled() {
        if (this.signal?.aborted) {
            throw new AIError("Answer cancelled");
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
