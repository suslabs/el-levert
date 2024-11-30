import VM from "../VM.js";

import EvalContext from "./context/EvalContext.js";
import InspectorServer from "./inspector/InspectorServer.js";

import VMErrors from "./VMErrors.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";
import VMUtil from "../../util/vm/VMUtil.js";

const logInspectorPackets = false;

function logUsage(code) {
    getLogger().debug(`Running script:${Util.formatLog(code)}`);
}

function logTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Running script took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

function logFinished(info) {
    getLogger().log(info ? "info" : "debug", "Script execution finished.");
}

class TagVM extends VM {
    static $name = "tagVM";
    static loadPriority = 1;

    constructor(enabled) {
        super(enabled);

        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outLineLimit = Util.clamp(getClient().config.outLineLimit, 0, 2000);

        this.enableInspector = getClient().config.enableInspector;
    }

    setupInspectorServer() {
        if (!this.enabled || !this.enableInspector) {
            return;
        }

        const inspectorPort = getClient().config.inspectorPort;

        const options = {
            logPackets: logInspectorPackets
        };

        const server = new InspectorServer(this.enableInspector, inspectorPort, options);
        server.setup();

        this.inspectorServer = server;
    }

    async getContext(msg, tag, args) {
        const context = new EvalContext(
            {
                memLimit: this.memLimit,
                timeLimit: this.timeLimit
            },
            {
                enable: this.enableInspector,
                sendReply: this.inspectorServer?.sendReply
            }
        );

        await context.getIsolate({ msg, tag, args });
        this.inspectorServer?.setContext(context);

        return context;
    }

    async runScript(code, msg, tag, args) {
        const t1 = performance.now();
        logUsage(code);

        if (this.inspectorServer?.inspectorConnected) {
            getLogger().info("Can't run script: inspector is already connected.");
            return ":no_entry_sign: Inspector is already connected.";
        }

        const context = await this.getContext(msg, tag, args);

        let out;

        try {
            out = await context.runScript(code);
            out = VMUtil.formatOutput(out);

            logFinished(this.enableInspector);
            getLogger().debug(`Returning script output:${Util.formatLog(out)}`);
        } catch (err) {
            logFinished(this.enableInspector);
            out = this.handleError(err);
        } finally {
            this.inspectorServer?.executionFinished();
            context.dispose();
        }

        logTime(t1);
        return out;
    }

    handleError(err) {
        switch (err.name) {
            case "VMError":
                getLogger().debug(`VM error: ${err.message}`);
                return `:no_entry_sign: ${err.message}.`;
            case "ExitError":
                getLogger().debug(`Returning exit data:${Util.formatLog(err.exitData)}`);
                return err.exitData;
            case "ManevraError":
                getLogger().debug(`Returning reply data:${Util.formatLog(err.message)}`);
                return this.processReply(err.message);
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

    processReply(msg) {
        const out = JSON.parse(msg),
            files = [];

        if (typeof out.content !== "undefined") {
            const str = out.content;

            if (str.length > this.outCharLimit || Util.countLines(str) > this.outLineLimit) {
                files.push(...Util.getFileAttach(str).files);
                delete out.content;
            }
        }

        if (typeof out.file !== "undefined") {
            let { data, name } = out.file;
            delete out.file;

            if (typeof data === "object") {
                data = Object.values(data);
            }

            files.push(...Util.getFileAttach(data, name).files);
        }

        if (files.length > 0) {
            out.files = files;
        }

        return out;
    }

    load() {
        this.setupInspectorServer();
    }

    unload() {
        if (typeof this.inspectorServer !== "undefined") {
            this.inspectorServer.close();
            delete this.inspectorServer;
        }
    }

    getDisabledMessage() {
        return "Eval is disabled.";
    }
}

export default TagVM;
