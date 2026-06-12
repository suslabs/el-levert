import ivm from "isolated-vm";
const { Isolate } = ivm;

import IsolateInspector from "../inspector/IsolateInspector.js";

import FakeUtil from "../classes/FakeUtil.js";
import FakeTag from "../classes/FakeTag.js";
import FakeMsg from "../classes/FakeMsg.js";
import FakeVM from "../classes/FakeVM.js";

import ContextFunctions from "./ContextFunctions.js";
import EventLoop from "./EventLoop.js";
import VMObjectRegistry from "./VMObjectRegistry.js";

import Functions from "./Functions.js";
import globalNames from "./globalNames.json" assert { type: "json" };
import funcNames from "./funcNames.json" assert { type: "json" };

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import VMUtil from "../../../util/vm/VMUtil.js";

import VMError from "../../../errors/VMError.js";
import { VMErrors } from "../VMErrors.js";

class EvalContext {
    static filename = "script.js";
    static evaluated = "evaluated script";

    static allowPromiseReturn = true;

    static initFunctions() {
        this.functions = ContextFunctions.fromMaps(Functions, {
            global: globalNames,
            func: funcNames
        });
    }

    constructor(options, inspectorOptions) {
        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        inspectorOptions = ObjectUtil.guaranteeObject(inspectorOptions);
        this.inspectorOptions = inspectorOptions;

        const invalidMemLimit = !Number.isFinite(options.memLimit) || options.memLimit <= 0;
        this.memLimit = invalidMemLimit ? -1 : Math.round(options.memLimit);

        const invalidTimeLimit = !Number.isFinite(options.timeLimit) || options.timeLimit <= 0;
        this.timeLimit = invalidTimeLimit ? -1 : Math.round(options.timeLimit);

        this.parent = options.parent ?? null;
        this.children = new Set();
        this.parent?.children.add(this);

        this.vmObjects = new VMObjectRegistry();

        this.enableInspector = inspectorOptions.enable ?? false;

        this._aborter = new AbortController();
        this.abortSignal = this._aborter.signal;
        this._disposed = false;
    }

    get scriptName() {
        return this.enableInspector ? `file:///${EvalContext.filename}` : `(<${EvalContext.evaluated}>)`;
    }

    async getIsolate(values) {
        values = ObjectUtil.guaranteeObject(values);

        if (typeof this.isolate === "undefined") {
            this._setupInspector();
            await this._setupIsolate(values);
        }

        return this.isolate;
    }

    get timeElapsed() {
        this._checkIsolate();
        return Number(this.isolate.wallTime / 1_000_000n);
    }

    get timeRemaining() {
        this._checkIsolate();
        return this.timeLimit > 0 ? Util.clamp(this.timeLimit - this.timeElapsed, 0) : NaN;
    }

    async compileScript(code) {
        this._checkIsolate();
        return await this._compileScript(code, true);
    }

    async runScript(code) {
        this._checkIsolate();
        const compileNow = Util.nonemptyString(code);

        let script = null;

        if (compileNow) {
            try {
                script = await this._compileScript(code, false);
            } catch (err) {
                return [undefined, err];
            }
        } else if (typeof this._script === "undefined") {
            throw new VMError("Can't run, no script was compiled");
        } else {
            script = this._script;
        }

        const config = {
            timeout: this.timeLimit !== -1 ? this.timeLimit : undefined,
            promise: EvalContext.allowPromiseReturn,
            copy: true
        };

        try {
            if (compileNow) {
                await this.vmObjects.set("code", code);
            }

            await this.inspector.waitForConnection();

            return await script
                .run(this.context, config)
                .then(out => [out, null])
                .catch(err => {
                    if (!this.enableInspector && !VMErrors.custom.includes(err.name)) {
                        VMUtil.rewriteIVMStackTrace(err);
                    }

                    return [undefined, err];
                });
        } finally {
            if (compileNow) {
                script.release();
                this.vmObjects.delete("code", false);
            }
        }
    }

    dispose() {
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this._aborter.abort();

        this._disposeChildren();
        this._disposeInspector();
        this._disposeEventLoop();
        this.vmObjects.dispose();
        this._disposeScript();
        this._disposeContext();
        this._disposeIsolate();
        this._removeFromParent();
    }

    _checkIsolate() {
        if (typeof this.isolate === "undefined") {
            throw new VMError("Isolate not initialized");
        }
    }

    _setupInspector() {
        this.inspector = new IsolateInspector(this.enableInspector, this.inspectorOptions);
    }

    async _setInfo() {
        await this.vmObjects.set("util", Object, [FakeUtil.getInfo()]);
    }

    async _setMsg(msg) {
        if (msg != null) {
            await this.vmObjects.set("msg", FakeMsg, [msg], "fixedMsg");
        }
    }

    async _setTag(tag, args) {
        if (tag != null) {
            await this.vmObjects.set("tag", FakeTag, [tag, args], "fixedTag");
        }
    }

    async _setVM() {
        await this.vmObjects.set("vm", FakeVM, [this.isolate], "vmProps");
    }

    _setPropertyMap() {
        const propertyMap = new Map();
        propertyMap.set("msg", this.vmObjects.msg);

        this._propertyMap = propertyMap;
    }

    async _setupContext(values) {
        const { msg, tag, args } = values;
        const context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        this.context = context;

        await this.vmObjects.create(context);
        this.eventLoop = new EventLoop(context);
        this.eventLoop.setup();

        await this._setInfo();
        await this._setMsg(msg);
        await this._setTag(tag, args);
        await this._setVM();

        this._setPropertyMap();
        await EvalContext.functions.register(this, this._propertyMap);
    }

    async _setupIsolate(values) {
        const config = {
            memoryLimit: this.memLimit !== -1 ? this.memLimit : undefined,
            inspector: this.enableInspector
        };

        this.isolate = new Isolate(config);

        await this._setupContext(values);
        this.inspector.create(this.isolate);
    }

    async _compileScript(code, setScript) {
        code = this.inspector.getDebuggerCode(code);

        const script = await this.isolate.compileScript(code, {
            filename: this.scriptName
        });

        if (setScript) {
            this._script = script;
        }

        return script;
    }

    _disposeChildren() {
        while (!Util.empty(this.children)) {
            const child = this.children.values().next().value;
            child.dispose();
        }
    }

    _disposeInspector() {
        this.inspector.dispose();
        delete this.inspector;
    }

    _disposeEventLoop() {
        this.eventLoop?.dispose();
        delete this.eventLoop;
    }

    _disposeScript() {
        this._script?.release();
        delete this._script;
    }

    _disposeContext() {
        this.context?.release();
        delete this.context;

        delete this._propertyMap;
    }

    _disposeIsolate() {
        if (!this.isolate?.isDisposed) {
            this.isolate?.dispose();
        }

        delete this.isolate;
    }

    _removeFromParent() {
        this.parent?.children.delete(this);
        delete this.parent;
    }
}

export default EvalContext;
