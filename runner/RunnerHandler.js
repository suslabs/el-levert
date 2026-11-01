import EvalContext from "./vm/context/EvalContext.js";

import { getRunnerLogger } from "./logger/RunnerLogger.js";

import Util from "@el-levert/common/util/Util.js";
import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";
import VMUtil from "./vm/util/VMUtil.js";
import { transpileScript } from "./vm/util/transpileScript.js";

import VMError from "@el-levert/common/errors/VMError.js";
import { VMErrors, vmErrorMessages } from "./vm/VMErrors.js";

class RunnerHandler {
    static defaultMemLimit = 128;
    static defaultTimeLimit = (10 * Util.durationSeconds.second) / Util.durationSeconds.milli;

    constructor(rpc, options) {
        options = ObjectUtil.guaranteeObject(options);

        const memLimit = options.memLimit ?? RunnerHandler.defaultMemLimit,
            timeLimit = options.timeLimit ?? RunnerHandler.defaultTimeLimit;

        this.rpc = rpc;
        this.memLimit = memLimit;
        this.timeLimit = timeLimit;
        this.options = options;

        this._contextStack = [];
    }

    async runScript(code, values, options) {
        values = ObjectUtil.guaranteeObject(values);
        options = ObjectUtil.guaranteeObject(options);

        code = transpileScript(code, options);

        let out,
            outErr = null,
            context = null,
            pushed = false;

        try {
            context = await this._getEvalContext(values, options);

            this._pushContext(context);
            pushed = true;

            [out, outErr] = await context.runScript(code);
        } catch (err) {
            outErr = err;
        } finally {
            if (pushed) {
                this._popContext(context);
            }

            context?.dispose();
        }

        let dataType;
        [out, dataType] = outErr ? this._handleScriptError(outErr) : this._handleScriptOutput(out);

        return [out, dataType];
    }

    _getActiveContext() {
        return this._contextStack.at(-1) ?? null;
    }

    async _getEvalContext(values, options) {
        options = ObjectUtil.guaranteeObject(options);

        const memLimit = options.memLimit ?? this.memLimit,
            timeLimit = options.timeLimit ?? this.timeLimit;

        const context = new EvalContext(
            {
                memLimit,
                timeLimit,
                parent: this._getActiveContext(),
                rpc: this.rpc
            },
            {
                enable: options.enableInspector ?? false,
                connectTimeout: 0,
                session: null
            }
        );

        await context.getIsolate(values);
        return context;
    }

    _pushContext(context) {
        this._contextStack.push(context);
    }

    _popContext(context) {
        const idx = this._contextStack.lastIndexOf(context);

        if (idx !== -1) {
            this._contextStack.splice(idx, 1);
        }
    }

    _handleScriptOutput(out) {
        return [VMUtil.formatOutput(out), "script"];
    }

    _handleScriptError(err) {
        switch (err.name) {
            case "VMError":
                getRunnerLogger().debug(`IVM error: ${err.message}`);
                throw err;

            case VMErrors.custom[0]:
                return [err.exitData, "exit"];
            case VMErrors.custom[1]:
                return [JSON.parse(err.message), "reply"];
        }

        const out = vmErrorMessages.get(err.message);

        if (typeof out === "undefined") {
            throw err;
        } else {
            getRunnerLogger().debug(`IVM error: ${out}.`);

            const vmErr = new VMError(out);
            VMUtil.rewriteIVMStackTrace(vmErr);

            throw vmErr;
        }
    }
}

export default RunnerHandler;
