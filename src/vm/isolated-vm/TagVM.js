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
    getLogger().debug(`Running script took ${(Date.now() - t1).toLocaleString()}ms.`);
}

class TagVM {
    constructor() {
        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.outCharLimit = getClient().config.outCharLimit;
        this.outNewlineLimit = getClient().config.outNewlineLimit;
    }

    setupInspectorServer() {
        const enable = getClient().config.enableInspector,
            port = getClient().config.inspectorPort;

        const options = {
            logPackets: logInspectorPackets
        };

        const server = new InspectorServer(enable, port, options);
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
                enable: this.inspectorServer?.enable ?? false,
                sendReply: this.inspectorServer?.sendReply
            }
        );

        await context.getIsolate({ msg, tag, args });
        this.inspectorServer?.setContext(context);

        return context;
    }

    async runScript(code, msg, tag, args) {
        const t1 = Date.now();
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

            getLogger().debug(`Returning script output:${Util.formatLog(out)}`);
        } catch (err) {
            out = this.handleError(err);
        } finally {
            getLogger().debug("Script execution finished.");

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
        let out = JSON.parse(msg);

        if (typeof out.content !== "undefined") {
            const split = out.content.split("\n");

            if (out.content.length > this.outCharLimit || split.length > this.outNewlineLimit) {
                return Util.getFileAttach(out.content);
            }
        }

        if (typeof out.file !== "undefined") {
            let { data, name } = out.file;
            delete out.file;

            if (typeof data === "object") {
                data = Object.values(data);
            }

            out = {
                ...out,
                ...Util.getFileAttach(data, name)
            };
        }

        return out;
    }

    unload() {
        this.inspectorServer?.close();
    }
}

export default TagVM;
