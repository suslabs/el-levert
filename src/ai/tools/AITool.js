import AIPhases from "../../structures/ai/AIPhases.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

import AIError from "../../errors/AIError.js";

class AITool {
    static info = null;

    static expectedErrors = new Set(["AIError", "UtilError", "TagError", "VMError", "AxiosError"]);
    static maxStatusArgLength = 60;

    constructor(manager) {
        const info = this.constructor.info;

        if (!TypeTester.isObject(info)) {
            throw new AIError("Tool must have info");
        } else if (!Util.nonemptyString(info.emoji)) {
            throw new AIError("Tool must have an emoji", info.name);
        } else if (!AIPhases.has(info.phase)) {
            throw new AIError("Tool must have a valid phase", info.name);
        } else if (typeof this.execute !== "function") {
            throw new AIError("Child class must have an execute function", info.name);
        } else if (typeof this.getStatus !== "function") {
            throw new AIError("Child class must have a getStatus function", info.name);
        }

        this.manager = manager;

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
        if (typeof this._childIsAvailable !== "function") {
            return true;
        }

        return this._childIsAvailable(session);
    }

    async _execute(args, session) {
        let out;

        try {
            out = await this._childExecute(args, session);
        } catch (err) {
            if (!AITool.expectedErrors.has(err.name)) {
                session.logError(this.name, err);
            }

            out = { error: err.message };
        }

        return this._limitOutput(out);
    }

    _limitOutput(out) {
        const text = JSON.stringify(out ?? null),
            maxOutput = this.manager.maxToolOutput;

        if (text.length <= maxOutput) {
            return out;
        }

        return {
            truncated: true,
            partial: text.slice(0, maxOutput)
        };
    }
}

export default AITool;
