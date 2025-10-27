import ivm from "isolated-vm";
const { Isolate, ExternalCopy } = ivm;

import IsolateInspector from "../inspector/IsolateInspector.js";

import FakeUtil from "../classes/FakeUtil.js";
import FakeTag from "../classes/FakeTag.js";
import FakeMsg from "../classes/FakeMsg.js";
import FakeVM from "../classes/FakeVM.js";

import VMFunction from "../../../structures/vm/VMFunction.js";
import VMErrors from "../VMErrors.js";

import Functions from "./Functions.js";
import globalNames from "./globalNames.json" assert { type: "json" };
import funcNames from "./funcNames.json" assert { type: "json" };

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import VMUtil from "../../../util/vm/VMUtil.js";

import VMError from "../../../errors/VMError.js";

class EvalContext {
    static filename = "script.js";
    static evaluated = "evaluated script";

    static allowPromiseReturn = true;

    static initFunctions() {
        this.functions = this._constructFuncs(Functions, {
            global: globalNames,
            func: funcNames
        });
    }

    constructor(options, inspectorOptions = {}) {
        this.options = options;
        this.inspectorOptions = inspectorOptions;

        const invalidMemLimit = !Number.isFinite(options.memLimit) || options.memLimit <= 0;
        this.memLimit = invalidMemLimit ? -1 : Math.round(options.memLimit);

        const invalidTimeLimit = !Number.isFinite(options.timeLimit) || options.timeLimit <= 0;
        this.timeLimit = invalidTimeLimit ? -1 : Math.round(options.timeLimit);

        this.enableInspector = inspectorOptions.enable ?? false;

        this._aborter = new AbortController();
        this.abortSignal = this._aborter.signal;

        this._vmObjects = [];
    }

    get scriptName() {
        return this.enableInspector ? `file:///${EvalContext.filename}` : `(<${EvalContext.evaluated}>)`;
    }

    async getIsolate(values = {}) {
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

    async setVMObject(name, _class, params, targetProp) {
        if (!Util.nonemptyString(name)) {
            throw new VMError("No object name provided");
        }

        this._checkIsolate();

        let obj, targetObj;

        if (TypeTester.isClass(_class)) {
            obj = new _class(...params);
            targetObj = targetProp == null || targetProp === "this" ? obj : obj[targetProp];
        } else {
            obj = _class;
            targetProp = params ?? "this";

            if (obj == null) {
                throw new VMError(`No data provided for object: ${name}`, { object: name });
            }

            targetObj = targetProp === "this" ? obj : obj[targetProp];
        }

        if (typeof targetObj === "undefined") {
            throw new VMError(`Invalid target property "${targetProp}" on object: ${name}`, {
                object: name,
                targetProp
            });
        }

        const targetName = `vm${Util.capitalize(name)}`,
            vmName = globalNames[name];

        if (typeof vmName === "undefined") {
            throw new VMError("Unknown global object: " + name, { global: name });
        }

        const vmObj = new ExternalCopy(targetObj);
        await this._global.set(vmName, vmObj.copyInto());

        this[name] = obj;
        this[targetName] = vmObj;

        this._vmObjects.push({ name, targetName });
    }

    deleteVMObject(name, errorIfNotFound = true) {
        if (!Util.nonemptyString(name)) {
            throw new VMError("No object name provided");
        }

        const obj = this._vmObjects.find(obj => obj.name === name);

        if (typeof obj === "undefined") {
            return errorIfNotFound
                ? () => {
                      throw new VMError(`Object ${name} not found`, name);
                  }
                : null;
        }

        this._disposeVMObjects(obj);
        return obj;
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
                await this.setVMObject("code", code);
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
                this.deleteVMObject("code", false);
            }
        }
    }

    dispose() {
        this._aborter.abort();

        this._disposeInspector();
        this._disposeVMObjects();
        this._disposeScript();
        this._disposeContext();
        this._disposeIsolate();
    }

    _setupInspector() {
        this.inspector = new IsolateInspector(this.enableInspector, this.inspectorOptions);
    }

    static _constructFunc(objName, funcName, properties) {
        const funcProperties = {
            singleContext: false,
            parent: objName,
            name: funcName
        };

        return new VMFunction({
            ...funcProperties,
            ...properties
        });
    }

    static _constructFuncs(objMap, names) {
        return Object.entries(objMap).flatMap(([objKey, funcMap]) => {
            if (typeof funcMap !== "object") {
                throw new VMError("Invalid object map");
            }

            const objName = names.global[objKey],
                funcNames = names.func[objKey];

            if (typeof objName === "undefined") {
                throw new VMError(`Name for object "${objKey}" not found`, objKey);
            }

            return Object.entries(funcMap).map(([funcKey, props]) => {
                const funcName = funcNames[funcKey];

                if (typeof funcName === "undefined") {
                    throw new VMError(`Name for function "${funcKey}" not found`, funcKey);
                }

                return this._constructFunc(objName, funcName, props);
            });
        });
    }

    async _setGlobal() {
        const global = this.context.global;

        this._global = global;
        await global.set("global", global.derefInto());

        this._vmObjects.push({ targetName: "global" });
    }

    async _setInfo() {
        await this.setVMObject("util", Object, [FakeUtil.getInfo()]);
    }

    async _setTag(tag, args) {
        if (tag != null && args != null) {
            await this.setVMObject("tag", FakeTag, [tag, args], "fixedTag");
        }
    }

    async _setMsg(msg) {
        if (msg != null) {
            await this.setVMObject("msg", FakeMsg, [msg], "fixedMsg");
        }
    }

    async _setVM() {
        await this.setVMObject("vm", FakeVM, [this.isolate], "vmProps");
    }

    _setPropertyMap() {
        const propertyMap = new Map();
        propertyMap.set("msg", this.msg);

        this._propertyMap = propertyMap;
    }

    async _registerFuncs() {
        await Promise.all(EvalContext.functions.map(func => func.register(this, this._propertyMap)));
    }

    async _setupContext(values) {
        const { msg, tag, args } = values;

        this.context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        await this._setGlobal();

        await this._setInfo();
        await this._setMsg(msg);
        await this._setTag(tag, args);
        await this._setVM();

        this._setPropertyMap();
        await this._registerFuncs();
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

    _disposeInspector() {
        this.inspector.dispose();
        delete this.inspector;
    }

    _disposeVMObject(obj) {
        if (typeof obj.name !== "undefined") {
            delete this[obj.name];
        }

        if (typeof obj.targetName !== "undefined") {
            this[obj.targetName]?.release();
            delete this[obj.targetName];
        }
    }

    _disposeVMObjects() {
        ArrayUtil.wipeArray(this._vmObjects, obj => {
            this._disposeVMObject(obj);
        });
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

    _checkIsolate() {
        if (typeof this.isolate === "undefined") {
            throw new VMError("Isolate not initialized");
        }
    }
}

export default EvalContext;
