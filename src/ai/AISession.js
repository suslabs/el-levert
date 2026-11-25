import { isUtf8 } from "node:buffer";

import AIAnswerParser from "./AIAnswerParser.js";
import AIPromptGuard from "./AIPromptGuard.js";
import AIToolPolicy from "./AIToolPolicy.js";
import AISourceLedger from "../structures/ai/AISourceLedger.js";
import AICallLedger from "../structures/ai/AICallLedger.js";

import AIPhases from "../structures/ai/AIPhases.js";
import AIEfforts from "../structures/ai/AIEfforts.js";

import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";
import DiscordUtil from "../util/DiscordUtil.js";
import LoggerUtil from "../util/LoggerUtil.js";
import ObjectUtil from "../util/ObjectUtil.js";
import AIUtil from "../util/ai/AIUtil.js";

import AIError from "../errors/AIError.js";

class AISession {
    static minCallTime = 2 / Util.durationSeconds.milli;

    static maxImages = 4;

    static toolMode = "AUTO";

    static maxHistoryTurns = 8;
    static maxTurnLength = 2000;
    static triageTurns = 3;

    static lookupArticleChars = 3000;

    static lookupNote =
        "Automatic lookup, already done for you (don't repeat these searches). Answer from the results that match what was asked:";

    constructor(manager, request, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.manager = manager;
        this.request = request;

        this.history = options.history ?? [];
        this.onProgress = options.onProgress ?? null;
        this.signal = options.signal ?? null;

        this.startTime = Date.now();
        this.deadline = this.startTime + (options.timeLimit ?? manager.timeLimit);
        this.state = manager.router.createState();
        this.effort = AIEfforts.research;
        this.toolPolicy = new AIToolPolicy();
        this.expert = this.history.some(turn => turn.expert === true);

        this.ledger = new AISourceLedger();
        this.calls = new AICallLedger(this.manager.tools);
        this.contents = [];
        this.files = new Map();
        this.images = [];

        this.steps = [];
        this.text = "";
        this.finishing = false;

        this._streamText = "";
    }

    get model() {
        return this.manager.router.getModel(this.state);
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
        if (this.manager.promptGuard.isDisclosureRequest(question)) {
            return await this._refuseDisclosure();
        }

        this._setQuestion(question);

        const triage = await this._triage();

        if (triage.privateInstructions) {
            return await this._refuseDisclosure();
        }

        this.toolPolicy = triage.toolPolicy;
        this.effort = this.toolPolicy.isExplicit ? AIEfforts.research : triage.effort;
        this._checkCancelled();

        if (triage.lookup !== null && !this.toolPolicy.isExplicit) {
            await this._lookUp(triage.lookup);
            this._checkCancelled();
        }

        const prompt = this.manager.prompt.build(this.request, this.manager.tools.getNames(this), this.effort);
        this.systemInstruction = { parts: [{ text: prompt }] };

        Util.last(this.contents).parts.push({ text: this.manager.prompt.buildDiscordContext(this.request) });

        return await this._respond();
    }

    async generateText(body) {
        const out = await this.manager.router.generate(body, this.state, {
            timeLeft: this.timeLeft,
            signal: this.signal
        });

        const text = AIUtil.getText(out.parts).trim();
        const structured = typeof body.generationConfig?.responseSchema !== "undefined";

        if (!structured && this.manager.promptGuard.contains(text)) {
            throw new AIError(AIPromptGuard.refusal, { privateInstructions: true });
        }

        return text;
    }

    toolTimeout() {
        return Util.clamp(
            this.timeLeft - this.manager.requestTimeout,
            AISession.minCallTime,
            this.manager.requestTimeout
        );
    }

    resolveExpert(expert) {
        if (expert === true) {
            this.expert = true;
        } else if (expert === false) {
            return false;
        }

        return this.expert;
    }

    attachFile(name, content) {
        let text = content;

        if (typeof content !== "string") {
            const data = ArrayUtil.toBuffer(content);
            text = isUtf8(data) ? data.toString("utf8") : "";
        }

        if (this.manager.promptGuard.contains([name, text])) {
            throw new AIError(AIPromptGuard.refusal, { privateInstructions: true });
        } else if (!this.files.has(name) && this.files.size >= DiscordUtil.msgFileLimit) {
            throw new AIError(`At most ${DiscordUtil.msgFileLimit} files can be attached`);
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

    _setQuestion(question) {
        const history = this.history.slice(-AISession.maxHistoryTurns).map(turn => {
            const text = this.manager.promptGuard.contains(turn.text)
                ? AIPromptGuard.refusal
                : Util.trimString(turn.text, AISession.maxTurnLength);
            return { role: turn.role, parts: [{ text }] };
        });

        this.contents = [...history, { role: "user", parts: [{ text: question }] }];
    }

    async _triage() {
        const startTime = Date.now();

        try {
            const triage = await this.manager.triage.classify(this, this.contents.slice(-AISession.triageTurns));

            getLogger().debug(`AI question sorted as ${triage.effort} in ${AIUtil.formatElapsed(startTime)}.`);

            return triage;
        } catch (err) {
            if (err.name !== "AIError" || this.signal?.aborted) {
                throw err;
            }

            const privateInstructions = err.ref?.privateInstructions === true;

            if (!privateInstructions) {
                getLogger().warn(`Couldn't sort an AI question by effort (${LoggerUtil.formatErrorSummary(err)}).`);
            }

            return { effort: AIEfforts.research, lookup: null, privateInstructions, toolPolicy: this.toolPolicy };
        }
    }

    async _readTopArticle(results) {
        const top = Util.first(results);

        if (typeof top === "undefined") {
            return null;
        }

        const args = { title: top.title, maxChars: AISession.lookupArticleChars };
        return Util.first(await this._runTools([{ name: "read_wikipedia", args }]));
    }

    // An unrestricted who/what question about an outside subject gets a lookup before answering.
    async _lookUp(subject) {
        const [wikipedia, web] = await this._runTools([
            { name: "search_wikipedia", args: { query: subject } },
            { name: "search_web", args: { query: subject } }
        ]);

        const article = await this._readTopArticle(wikipedia.results ?? []);

        const results = JSON.stringify({ subject, wikipedia, article, web });
        Util.last(this.contents).parts.push({ text: `${AISession.lookupNote}\n${results}` });
    }

    async _respond() {
        const forcedTools = new Set();

        let forcedTool = null;
        let answerOnly = false;
        let rejectedRound = false;

        for (let i = 0; i < this.maxSteps; i++) {
            this._checkCancelled();

            if (this.timeLeft < AISession.minCallTime) {
                throw new AIError("Ran out of time", { steps: this.steps.length });
            }

            const stepStart = Date.now();

            const tools = this.manager.tools.getDeclarations(this),
                names = tools.map(tool => tool.name);

            const pending = this.toolPolicy.pending(names, this.calls);
            const reserve = Util.empty(pending) ? this.manager.requestTimeout : 2 * AISession.minCallTime;

            const final = answerOnly || i === this.maxSteps - 1 || this.timeLeft < reserve || Util.empty(tools);
            const canAnswer = final || Util.empty(pending);

            const toolNote = this.toolPolicy.describe(names, pending, final);
            const body = this._buildRequest(tools, toolNote, final, forcedTool);

            let res;

            try {
                res = await this._stream(body, final);
            } catch (err) {
                if (final || forcedTool === null || !(err instanceof AIError) || this.signal?.aborted) {
                    throw err;
                }

                getLogger().warn(
                    `AI could not request required tool "${forcedTool}" (${LoggerUtil.formatErrorSummary(err)}).`
                );
                answerOnly = true;
                await this._resetText();
                continue;
            }

            const modelCalls = AIUtil.getCalls(res.parts);

            if (this.manager.promptGuard.contains([this._streamText, modelCalls])) {
                return await this._refuseDisclosure();
            }

            const calls = final ? [] : modelCalls;
            this._logStep(i, stepStart, calls, canAnswer);

            const hasCalls = !Util.empty(calls);

            if (hasCalls) {
                const responses = await this._runCalls(calls);
                this.contents.push({ role: "model", parts: res.parts }, { role: "user", parts: responses });
            } else if (canAnswer) {
                return await this._finish(res.finishReason);
            }

            const rejected = hasCalls && calls.every(call => !this.toolPolicy.allows(call.name));

            if (!hasCalls || (rejected && !Util.empty(pending))) {
                forcedTool = pending.find(name => !forcedTools.has(name)) ?? null;
                answerOnly = forcedTool === null;

                if (forcedTool !== null) {
                    forcedTools.add(forcedTool);
                    getLogger().debug(`Retrying AI response with required tool "${forcedTool}".`);
                }

                if (!hasCalls) {
                    await this._resetText();
                }
            } else {
                forcedTool = null;
                answerOnly = rejected && rejectedRound;
            }

            rejectedRound = rejected;
        }

        throw new AIError("Ran out of steps", { steps: this.steps.length });
    }

    _buildRequest(tools, toolNote, final, forcedTool) {
        const note = this.manager.prompt.buildNote(final, this.expert, this.calls.foundNothing, toolNote);

        let contents = this.contents;

        if (!Util.empty(note)) {
            const last = Util.last(contents);
            contents = [...contents.slice(0, -1), { ...last, parts: [...last.parts, { text: note }] }];
        }

        const body = { systemInstruction: this.systemInstruction, contents };

        if (final) {
            return body;
        }

        const functionCallingConfig =
            forcedTool === null ? { mode: AISession.toolMode } : { mode: "ANY", allowedFunctionNames: [forcedTool] };

        return {
            ...body,
            tools: [{ functionDeclarations: tools }],
            toolConfig: { functionCallingConfig }
        };
    }

    async _stream(body, final) {
        return await this.manager.router.stream(body, this.state, {
            timeLeft: this.timeLeft,
            signal: this.signal,
            thinkingLevel: final ? this.manager.thinkingLevel : this.manager.toolThinkingLevel,
            onParts: parts => {
                this._streamText += AIUtil.getText(parts);
            },
            onRestart: () => this._resetText()
        });
    }

    async _resetText() {
        this._streamText = "";
        await this._reportProgress();
    }

    _logStep(i, startTime, calls, canAnswer) {
        let action;

        if (!Util.empty(calls)) {
            action = `requested ${calls.map(call => this.manager.tools.getLogName(call.name)).join(", ")}`;
        } else {
            action = canAnswer ? "wrote the answer" : "returned without calling a required tool";
        }

        getLogger().debug(`AI step ${i + 1} on ${this.model} took ${AIUtil.formatElapsed(startTime)} and ${action}.`);
    }

    async _runTools(calls) {
        const steps = calls
            .filter(call => this.toolPolicy.allows(call.name))
            .map(call => this.manager.tools.createStep(call.name, call.args, this));

        this._streamText = "";
        this.steps.push(...steps);

        await this._reportProgress();
        return await Promise.all(calls.map(call => this._runTool(call)));
    }

    async _runTool(call) {
        if (!this.toolPolicy.allows(call.name)) {
            const name = this.manager.tools.getLogName(call.name);
            getLogger().debug(`Skipped AI tool "${name}" because the user's tool restrictions prohibit it.`);
            return { error: `The user's tool restrictions prohibit "${call.name}".` };
        }

        const res = await this.calls.run(call, () => this.manager.tools.execute(call.name, call.args, this));
        this.ledger.record(res);

        return res;
    }

    async _runCalls(calls) {
        const results = await this._runTools(calls);
        return calls.map((call, i) => AIUtil.createResponse(call, results[i]));
    }

    async _refuseDisclosure() {
        getLogger().debug("Withheld a request or response involving private AI instructions.");
        this.files.clear();
        this.images.length = 0;
        this._streamText = AIPromptGuard.refusal;

        return await this._finish(null);
    }

    async _finish(finishReason) {
        const { answer, followUps, sources } = AIAnswerParser.parse(this._streamText, this.ledger);

        if (Util.empty(answer)) {
            const reason = finishReason ?? "empty response";
            throw new AIError(`The model returned no answer (${reason})`, { reason });
        }

        this.text = answer;
        this.finishing = true;
        await this._reportProgress();

        this._checkCancelled();

        getLogger().debug(
            `AI answer took ${AIUtil.formatElapsed(this.startTime)} over ${this.steps.length} tool call(s).`
        );

        return {
            answer,
            followUps,
            sources,
            files: Array.from(this.files, ([name, content]) => ({ name, content })),
            images: this.images,
            expert: this.expert,
            models: this.state.models,
            tokens: this.state.tokens,
            reasoning: this.state.reasoning,
            elapsed: Date.now() - this.startTime
        };
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
