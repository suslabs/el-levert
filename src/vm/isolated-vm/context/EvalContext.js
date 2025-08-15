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
        const invalidMemLimit = isNaN(options.memLimit) || options.memLimit <= 0;
        this.memLimit = invalidMemLimit ? -1 : options.memLimit;

        const invalidTimeLimit = isNaN(options.timeLimit) || options.timeLimit <= 0;
        this.timeLimit = invalidTimeLimit ? -1 : options.timeLimit;

        this._setupInspector(inspectorOptions);

        this.scriptName = this._getScriptName();
        this._vmObjects = [];
    }

    async getIsolate(values = {}) {
        if (typeof this.isolate === "undefined") {
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

        if (this.timeLimit === -1) {
            return NaN;
        }

        return Util.clamp(this.timeLimit - this.timeElapsed, 0);
    }

    async setVMObject(name, _class, params, targetProp = "this") {
        this._checkIsolate();

        const obj = new _class(...params),
            targetObj = targetProp === "this" ? obj : obj[targetProp];

        if (typeof targetObj === "undefined") {
            throw new VMError(`Invalid target property "${targetProp}" on object: ${name}`);
        }

        const targetName = `vm${Util.capitalize(name)}`,
            vmName = globalNames[name];

        if (typeof vmName === "undefined") {
            throw new VMError("Unknown global object: " + name);
        }

        const vmObj = new ExternalCopy(targetObj);
        await this._global.set(vmName, vmObj.copyInto());

        this[name] = obj;
        this[targetName] = vmObj;

        this._vmObjects.push({ name, targetName });
    }

    async compileScript(code, setField = true) {
        this._checkIsolate();
        code = this.inspector.getDebuggerCode(code);

        const script = await this.isolate.compileScript(code, {
            filename: this.scriptName
        });

        if (setField) {
            this._script = script;
        } else {
            return script;
        }
    }

    async runScript(code) {
        this._checkIsolate();
        const compileNow = typeof code !== "undefined";

        let script;

        if (compileNow) {
            script = await this.compileScript(code, false);
        } else if (typeof this._script === "undefined") {
            throw new VMError("Can't run, no script was compiled");
        } else {
            script = this._script;
        }

        await this.inspector.waitForConnection();

        try {
            const config = {
                promise: EvalContext.allowPromiseReturn,
                copy: true
            };

            if (this.timeLimit !== -1) {
                config.timeout = this.timeLimit;
            }

            return await script.run(this.context, config);
        } catch (err) {
            if (this.enableInspector || VMErrors.custom.includes(err.name)) {
                throw err;
            }

            VMUtil.rewriteIVMStackTrace(err);
            throw err;
        } finally {
            if (compileNow) {
                script.release();
            }
        }
    }

    dispose() {
        this._disposeInspector();
        this._disposeVMObjects();
        this._disposeScript();
        this._disposeIsolate();
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
            if (funcMap == null) {
                throw new VMError("Invalid object map");
            }

            const objName = names.global[objKey],
                funcNames = names.func[objKey];

            if (typeof objName === "undefined") {
                throw new VMError(`Object ${objKey} not found`);
            }

            return Object.entries(funcMap).map(([funcKey, props]) => {
                const funcName = funcNames[funcKey];

                if (typeof funcName === "undefined") {
                    throw new VMError(`Function ${funcKey} not found`);
                }

                return this._constructFunc(objName, funcName, props);
            });
        });
    }

    _getScriptName() {
        if (this.enableInspector) {
            return `file:///${EvalContext.filename}`;
        } else {
            return `(<${EvalContext.evaluated}>)`;
        }
    }

    _setupInspector(options) {
        const enableInspector = options.enable ?? false;

        this.inspector = new IsolateInspector(enableInspector, options);
        this.enableInspector = enableInspector;
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
        await this.setVMObject("tag", FakeTag, [tag, args], "fixedTag");
    }

    async _setMsg(msg) {
        await this.setVMObject("msg", FakeMsg, [msg], "fixedMsg");
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
            inspector: this.enableInspector
        };

        if (this.memLimit !== -1) {
            this.memoryLimit = this.memLimit;
        }

        this.isolate = new Isolate(config);

        await this._setupContext(values);
        this.inspector.create(this.isolate);
    }

    _disposeInspector() {
        this.inspector.dispose();
        delete this.inspector;
    }

    _disposeVMObjects() {
        ArrayUtil.wipeArray(this._vmObjects, obj => {
            if (typeof obj.name !== "undefined") {
                delete this[obj.name];
            }

            if (typeof obj.targetName !== "undefined") {
                this[obj.targetName]?.release();
                delete this[obj.targetName];
            }
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
        if (typeof this.isolate === "undefined") {
            return;
        }

        if (!this.isolate.isDisposed) {
            this.isolate.dispose();
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
