import AIPhases from "../../structures/ai/AIPhases.js";
import AIEfforts from "../../structures/ai/AIEfforts.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import TypeTester from "../../util/TypeTester.js";
import AIUtil from "../../util/ai/AIUtil.js";

import AIError from "../../errors/AIError.js";

class AITool {
    static info = null;

    static expectedErrors = new Set([
        "AIError",
        "UtilError",
        "TagError",
        "VMError",
        "QuestbookError",
        "OCError",
        "AxiosError"
    ]);
    static maxStatusArgLength = 60;
    static maxCalls = Infinity;

    static quick = false;

    constructor() {
        const info = this.constructor.info;

        if (!TypeTester.isObject(info)) {
            throw new AIError("Tool must have info");
        } else if (!Util.nonemptyString(info.emoji)) {
            throw new AIError("Tool must have an emoji");
        } else if (!AIPhases.has(info.phase)) {
            throw new AIError("Tool must have a valid phase");
        } else if (typeof this.execute !== "function") {
            throw new AIError("Child class must have an execute function");
        } else if (typeof this.getStatus !== "function") {
            throw new AIError("Child class must have a getStatus function");
        }

        this._childIsAvailable = this.isAvailable;
        this.isAvailable = this._isAvailable.bind(this);

        this._childExecute = this.execute;
        this.execute = this._execute.bind(this);
    }

    get name() {
        return this.constructor.info.name;
    }

    get phase() {
        return this.constructor.info.phase;
    }

    get declaration() {
        const { name, description, parameters } = this.constructor.info;
        return typeof parameters === "undefined" ? { name, description } : { name, description, parameters };
    }

    requireString(args, name) {
        const value = String(args[name] ?? "").trim();

        if (Util.empty(value)) {
            throw new AIError(`${name} is required`);
        }

        return value;
    }

    getLimit(args, maxLimit = this.constructor.maxLimit) {
        return Util.clamp(args.limit ?? this.constructor.defaultLimit, 1, maxLimit);
    }

    formatArg(value) {
        return Util.trimString(String(value ?? "").replaceAll("\n", " "), AITool.maxStatusArgLength);
    }

    createStep(args) {
        return {
            phase: this.phase,
            emoji: this.constructor.info.emoji,
            status: this.getStatus(args)
        };
    }

    _isAvailable(session) {
        if (session.effort === AIEfforts.quick && !this.constructor.quick) {
            return false;
        } else if (typeof this._childIsAvailable !== "function") {
            return true;
        }

        return this._childIsAvailable(session);
    }

    async _execute(args, session) {
        const logger = getLogger(),
            aiManager = getClient().aiManager;

        if (logger.isDebugEnabled()) {
            logger.debug(`AI tool "${this.name}" called with args:${aiManager.formatLog(args)}`);
        }

        const startTime = Date.now();
        let out;

        try {
            out = await this._childExecute(args, session);
        } catch (err) {
            if (!AITool.expectedErrors.has(err.name)) {
                logger.error(
                    `AI tool "${this.name}" failed (${LoggerUtil.formatErrorSummary(err, aiManager.redactLogText)}).`
                );
            }

            out = { error: err.message };
        }

        logger.debug(`AI tool "${this.name}" took ${AIUtil.formatElapsed(startTime)}.`);

        if (logger.isDebugEnabled()) {
            logger.debug(`AI tool "${this.name}" returned:${aiManager.formatLog(out)}`);
        }

        return this._limitOutput(out);
    }

    _limitOutput(out) {
        const text = JSON.stringify(out ?? null),
            maxOutput = getClient().aiManager.maxToolOutput;

        if (text.length <= maxOutput) {
            return out;
        }

        return {
            truncated: true,
            found: AIUtil.hasFindings(out),
            partial: text.slice(0, maxOutput)
        };
    }
}

export default AITool;
