import VM from "../VM.js";

import EvalContext from "./context/EvalContext.js";
import InspectorServer from "./inspector/InspectorServer.js";

import { getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import VMUtil from "../../util/vm/VMUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

import VMError from "../../errors/VMError.js";
import VMErrors from "./VMErrors.js";

function logUsage(code) {
    getLogger().isDebugEnabled() && getLogger().debug(`Running script:${LoggerUtil.formatLog(code)}`);
}

function logFinished(timeKey, info) {
    if (!info && !getLogger().isDebugEnabled()) {
        Benchmark.stopTiming(timeKey, null);
        return;
    }

    const elapsed = Benchmark.stopTiming(timeKey, false),
        level = info ? "info" : "debug";

    getLogger().log(level, `Script execution took ${Util.formatNumber(elapsed)} ms.`);
}

function logOutput(out, dataType) {
    if (getLogger().isDebugEnabled()) {
        const desc = dataType === "script" ? "output" : "data";
        getLogger().debug(`Returning ${dataType} ${desc}:${LoggerUtil.formatLog(out)}`);
    }
}

class TagVM extends VM {
    static $name = "tagVM";
    static VMname = "isolated-vm";

    static loadPriority = 1;

    static logInspectorPackets = false;

    constructor(enabled) {
        super(enabled);

        this.memLimit = getConfig().memLimit;
        this.timeLimit = getConfig().timeLimit;

        this.enableInspector = getConfig().enableInspector;
    }

    async runScript(code, values) {
        logUsage(code);

        if (this._inspectorServer?.inspectorConnected) {
            getLogger().info("Can't run script: inspector is already connected.");
            throw new VMError("Inspector is already connected.");
        }

        const timeKey = Benchmark.startTiming(Symbol("vm_script"));

        const context = await this._getEvalContext(values);

        let out,
            outErr = null;

        try {
            [out, outErr] = await context.runScript(code);
        } catch (err) {
            outErr = err;
        }

        logFinished(timeKey, this.enableInspector);

        this._inspectorServer?.executionFinished();
        context.dispose();

        let dataType;
        [out, dataType] = outErr ? this._handleScriptError(outErr) : this._handleScriptOuput(out);

        logOutput(out, dataType);
        return out;
    }

    load() {
        EvalContext.initFunctions();
        this._setupInspectorServer();
    }

    unload() {
        if (typeof this._inspectorServer !== "undefined") {
            this._inspectorServer.close();
            delete this._inspectorServer;
        }
    }

    getDisabledMessage() {
        return "Eval is disabled";
    }

    _setupInspectorServer() {
        if (!this.enabled || !this.enableInspector) {
            return;
        }

        const inspectorPort = getConfig().inspectorPort;

        const options = {
            logPackets: TagVM.logInspectorPackets
        };

        const server = new InspectorServer(this.enableInspector, inspectorPort, options);
        server.setup();

        this._inspectorServer = server;
    }

    async _getEvalContext(values) {
        const context = new EvalContext(
            {
                memLimit: this.memLimit,
                timeLimit: this.timeLimit
            },
            {
                enable: this.enableInspector,
                sendReply: this._inspectorServer?.sendReply
            }
        );

        await context.getIsolate(values);
        this._inspectorServer?.setContext(context);

        return context;
    }

    _handleScriptOuput(out) {
        return [VMUtil.formatOutput(out), "script"];
    }

    _processReply(msg) {
        const out = JSON.parse(msg);

        if (out.file != null) {
            let { data, name } = out.file;

            if (TypeTester.isObject(data)) {
                data = Object.values(data);
            }

            const { file: _, ...outData } = out;

            return {
                ...outData,
                ...DiscordUtil.getFileAttach(data, name)
            };
        }

        return out;
    }

    _handleScriptError(err) {
        switch (err.name) {
            case "VMError":
                getLogger().debug(`IVM error: ${err.message}`);
                throw err;

            case VMErrors.custom[0]:
                return [err.exitData, "exit"];
            case VMErrors.custom[1]:
                return [this._processReply(err.message), "reply"];
        }

        const find = Object.entries(VMErrors).find(([name, info]) => name !== "custom" && err.message === info.in);

        if (typeof find === "undefined") {
            throw err;
        } else {
            const [, info] = find;
            getLogger().debug(`IVM error: ${info.out}.`);
            throw new VMError(info.out);
        }
    }
}

export default TagVM;
