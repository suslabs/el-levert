import VM from "../VM.js";

import EvalContext from "./context/EvalContext.js";
import InspectorServer from "./inspector/InspectorServer.js";
import { InspectorModes } from "./inspector/InspectorModes.js";

import { getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

import VMUtil from "../../util/vm/VMUtil.js";
import { transpileScript } from "../../util/vm/transpileScript.js";

import VMError from "../../errors/VMError.js";
import { VMErrors, vmErrorMessages } from "./VMErrors.js";

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
        this.enableUserInspector = this.enableInspector && (getConfig().enableUserInspector ?? false);
        this.inspectorMode = this._getInspectorMode();

        this._contextStack = [];
    }

    async runScript(code, values, options) {
        values = ObjectUtil.guaranteeObject(values);
        options = ObjectUtil.guaranteeObject(options);

        code = transpileScript(code, options);
        logUsage(code);

        const inspectorInfo = this._getInspectorInfo(values, options);

        if (inspectorInfo.enable) {
            options.commandContext?.disableTimeout();
        }

        if (
            inspectorInfo.mode === InspectorModes.console &&
            this._inspectorServer?.inspectorConnected &&
            Util.empty(this._contextStack)
        ) {
            getLogger().info("Can't run script: inspector is already connected.");
            throw new VMError("Inspector is already connected.");
        }

        const timeKey = Benchmark.startTiming(Symbol("vm_script"));

        let out,
            outErr = null,
            context = null,
            pushed = false;

        try {
            context = await this._getEvalContext(values, inspectorInfo);
            this._pushContext(context);
            pushed = true;

            if (inspectorInfo.createdSession) {
                await options.onInspectorReady?.(this._inspectorServer?.getSessionInfo(inspectorInfo.session));
            }

            [out, outErr] = await context.runScript(code);
        } catch (err) {
            outErr = err;
        } finally {
            if (pushed) {
                this._popContext(context);
            } else if (inspectorInfo.createdSession) {
                this._inspectorServer?.onSessionEmpty(inspectorInfo.session);
            }

            context?.dispose();
        }

        logFinished(timeKey, inspectorInfo.enable);

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
            logPackets: TagVM.logInspectorPackets,
            mode: this.inspectorMode,
            userInspectorActionTimeout: getConfig().userInspectorActionTimeout
        };

        const server = new InspectorServer(this.enableInspector, inspectorPort, options);
        server.setup();

        this._inspectorServer = server;
    }

    _getActiveContext() {
        return this._contextStack.at(-1) ?? null;
    }

    async _getEvalContext(values, inspectorInfo) {
        inspectorInfo = ObjectUtil.guaranteeObject(inspectorInfo, {
            connectTimeout: 0,
            enable: false,
            session: null
        });

        const context = new EvalContext(
            {
                memLimit: this.memLimit,
                timeLimit: this.timeLimit,
                parent: this._getActiveContext()
            },
            {
                connectTimeout: inspectorInfo.connectTimeout,
                enable: inspectorInfo.enable,
                inspectorSession: inspectorInfo.session,
                sendReply: inspectorInfo.session?.sendReply
            }
        );

        await context.getIsolate(values);
        return context;
    }

    _pushContext(context) {
        this._contextStack.push(context);
        context.inspectorSession?.pushContext(context);
    }

    _popContext(context) {
        const idx = this._contextStack.lastIndexOf(context);

        if (idx !== -1) {
            this._contextStack.splice(idx, 1);
        }

        context.inspectorSession?.popContext(context);
    }

    _getInspectorMode() {
        if (!this.enableInspector) {
            return InspectorModes.off;
        }

        return this.enableUserInspector ? InspectorModes.user : InspectorModes.console;
    }

    _getInspectorInfo(values, options) {
        values = ObjectUtil.guaranteeObject(values);
        options = ObjectUtil.guaranteeObject(options);

        const parent = this._getActiveContext(),
            parentSession = parent?.inspectorSession ?? null;

        if (parentSession !== null) {
            return {
                connectTimeout: parent.inspector.connectTimeout,
                createdSession: false,
                enable: true,
                mode: parentSession.mode,
                session: parentSession
            };
        }

        switch (this.inspectorMode) {
            case InspectorModes.console:
                return {
                    connectTimeout: getConfig().inspectorConnectTimeout,
                    createdSession: false,
                    enable: true,
                    mode: InspectorModes.console,
                    session: this._inspectorServer?.getConsoleSession() ?? null
                };
            case InspectorModes.user:
                if (!options.enableInspector) {
                    break;
                }

                return {
                    connectTimeout: getConfig().userInspectorConnectTimeout,
                    createdSession: true,
                    enable: true,
                    mode: InspectorModes.user,
                    session: this._createUserInspectorSession(values, options)
                };
        }

        return {
            connectTimeout: 0,
            createdSession: false,
            enable: false,
            mode: InspectorModes.off,
            session: null
        };
    }

    _createUserInspectorSession(values, options) {
        values = ObjectUtil.guaranteeObject(values);
        options = ObjectUtil.guaranteeObject(options);

        const userId = options.commandContext?.msg?.author?.id ?? values.msg?.author?.id ?? null;

        return this._inspectorServer.createUserSession({
            title: options.inspectorTitle,
            url: options.inspectorSourceUrl,
            userId
        });
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

        const out = vmErrorMessages.get(err.message);

        if (typeof out === "undefined") {
            throw err;
        } else {
            getLogger().debug(`IVM error: ${out}.`);
            throw new VMError(out);
        }
    }
}

export default TagVM;
