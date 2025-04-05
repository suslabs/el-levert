import VM from "../VM.js";

import EvalContext from "./context/EvalContext.js";
import InspectorServer from "./inspector/InspectorServer.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import { isObject } from "../../util/misc/TypeTester.js";
import VMUtil from "../../util/vm/VMUtil.js";

import VMErrors from "./VMErrors.js";

function logUsage(code) {
    getLogger().debug(`Running script:${Util.formatLog(code)}`);
}

function logTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Running script took ${Util.formatNumber(Util.timeDelta(t2, t1))}ms.`);
}

function logFinished(info) {
    getLogger().log(info ? "info" : "debug", "Script execution finished.");
}

class TagVM extends VM {
    static $name = "tagVM";
    static loadPriority = 1;

    static logInspectorPackets = false;

    constructor(enabled) {
        super(enabled);

        const timeLimit = getClient().config.otherTimeLimit,
            limitMs = Math.floor(timeLimit / Util.durationSeconds.milli);

        this.memLimit = getClient().config.memLimit;
        this.timeLimit = limitMs;

        this.enableInspector = getClient().config.enableInspector;
    }

    async runScript(code, values) {
        const t1 = performance.now();
        logUsage(code);

        if (this._inspectorServer?.inspectorConnected) {
            getLogger().info("Can't run script: inspector is already connected.");
            return ":no_entry_sign: Inspector is already connected.";
        }

        const context = await this._getContext(values);

        try {
            const out = await context.runScript(code);

            logFinished(this.enableInspector);
            logTime(t1);

            getLogger().debug(`Returning script output:${Util.formatLog(out)}`);
            return VMUtil.formatOutput(out);
        } catch (err) {
            logFinished(this.enableInspector);
            return this._handleError(err);
        } finally {
            this._inspectorServer?.executionFinished();
            context.dispose();
        }
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
        return "Eval is disabled.";
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

    async _getContext(values) {
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

    _handleError(err) {
        switch (err.name) {
            case VMErrors.custom[0]:
                getLogger().debug(`VM error: ${err.message}`);
                return `:no_entry_sign: ${err.message}.`;
            case VMErrors.custom[1]:
                getLogger().debug(`Returning exit data:${Util.formatLog(err.exitData)}`);
                return err.exitData;
            case VMErrors.custom[2]:
                getLogger().debug(`Returning reply data:${Util.formatLog(err.message)}`);
                return this._processReply(err.message);
        }

        switch (err.message) {
            case VMErrors.timeout:
                getLogger().debug("VM error: Script execution timed out.");
                return ":no_entry_sign: Script execution timed out.";
            case VMErrors.memLimit:
                getLogger().debug("VM error: Memory limit reached.");
                return ":no_entry_sign: Memory limit reached.";
            default:
                throw err;
        }
    }

    _processReply(msg) {
        const out = JSON.parse(msg);

        if (out.file != null) {
            let { data, name } = out.file;
            delete out.file;

            if (isObject(data)) {
                data = Object.values(data);
            }

            Object.assign(out, Util.getFileAttach(data, name));
        }

        return out;
    }
}

export default TagVM;
