import VM from "../VM.js";

import EvalContext from "./context/EvalContext.js";
import InspectorServer from "./inspector/InspectorServer.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import VMUtil from "../../util/vm/VMUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import VMError from "../../errors/VMError.js";
import VMErrors from "./VMErrors.js";

function logUsage(code) {
    getLogger().isDebugEnabled() && getLogger().debug(`Running script:${LoggerUtil.formatLog(code)}`);
}

function logFinished(t1, info) {
    if (!info && !getLogger().isDebugEnabled()) {
        return;
    }

    const level = info ? "info" : "debug",
        t2 = performance.now();

    getLogger().log(level, `Script execution took ${Util.formatNumber(Util.timeDelta(t2, t1))} ms.`);
}

function logOutput(dataType, out) {
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

        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.enableInspector = getClient().config.enableInspector;
    }

    async runScript(code, values) {
        const t1 = performance.now();
        logUsage(code);

        if (this._inspectorServer?.inspectorConnected) {
            getLogger().info("Can't run script: inspector is already connected.");
            throw new VMError("Inspector is already connected.");
        }

        const context = await this._getEvalContext(values);

        let out, dataType;

        try {
            out = await context.runScript(code);
            [dataType, out] = this._handleScriptOuput(out);
        } catch (err) {
            [dataType, out] = this._handleScriptError(err);
        } finally {
            logFinished(t1, this.enableInspector);

            this._inspectorServer?.executionFinished();
            context.dispose();
        }

        logOutput(dataType, out);
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

        const inspectorPort = getClient().config.inspectorPort;

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
        return ["script", VMUtil.formatOutput(out)];
    }

    _processReply(msg) {
        const out = JSON.parse(msg);

        if (out.file != null) {
            let { data, name } = out.file;
            delete out.file;

            if (TypeTester.isObject(data)) {
                data = Object.values(data);
            }

            Object.assign(out, DiscordUtil.getFileAttach(data, name));
        }

        return out;
    }

    _handleScriptError(err) {
        switch (err.name) {
            case "VMError":
                getLogger().debug(`IVM error: ${err.message}`);
                throw err;

            case VMErrors.custom[0]:
                return ["exit", err.exitData];
            case VMErrors.custom[1]:
                return ["reply", this._processReply(err.message)];
        }

        const foundError = Object.entries(VMErrors).find(
            ([name, info]) => name !== "custom" && err.message === info.in
        );

        if (typeof foundError === "undefined") {
            throw err;
        } else {
            const [, info] = foundError;
            getLogger().debug(`IVM error: ${info.out}.`);
            throw new VMError(info.out);
        }
    }
}

export default TagVM;
