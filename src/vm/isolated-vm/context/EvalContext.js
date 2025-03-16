import ivm from "isolated-vm";
const { Isolate, ExternalCopy } = ivm;

import FakeUtil from "../classes/FakeUtil.js";
import FakeTag from "../classes/FakeTag.js";
import FakeMsg from "../classes/FakeMsg.js";
import FakeVM from "../classes/FakeVM.js";

import VMFunction from "../../../structures/vm/VMFunction.js";
import VMError from "../../../errors/VMError.js";

import Functions from "./Functions.js";
import globalNames from "./globalNames.json" assert { type: "json" };
import funcNames from "./funcNames.json" assert { type: "json" };

import VMErrors from "../VMErrors.js";
import IsolateInspector from "../inspector/IsolateInspector.js";

import Util from "../../../util/Util.js";
import VMUtil from "../../../util/vm/VMUtil.js";

class EvalContext {
    static filename = "script.js";
    static evaluated = "evaluated script";

    static allowPromiseReturn = true;

    constructor(options, inspectorOptions = {}) {
        this.memLimit = options.memLimit;
        this.timeLimit = options.timeLimit;

        this._setupInspector(inspectorOptions);

        this.scriptName = this._getScriptName();
        this._vmObjects = [];
    }

    async getIsolate(options) {
        if (typeof this._isolate === "undefined") {
            const { msg, tag, args } = options;
            await this._setupIsolate(msg, tag, args);
        }

        return this._isolate;
    }

    async setVMObject(name, _class, params, targetProp = "this") {
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
        code = this.inspector.getDebuggerCode(code);

        const script = await this._isolate.compileScript(code, {
            filename: this.scriptName
        });

        if (setField) {
            this._script = script;
        } else {
            return script;
        }
    }

    async runScript(code) {
        const compileNow = typeof code !== "undefined";

        let script;

        if (compileNow) {
            script = await this.compileScript(code, false);
        } else if (typeof this._script === "undefined") {
            throw new VMError("Can't run script, no script was compiled");
        } else {
            script = this._script;
        }

        await this.inspector.waitForConnection();

        try {
            return await script.run(this._context, {
                timeout: this.timeLimit,
                promise: EvalContext.allowPromiseReturn,
                copy: true
            });
        } catch (err) {
            if (this.enableInspector || VMErrors.custom.includes(err.name)) {
                throw err;
            }

            if (typeof err.stack === "string") {
                const newStack = VMUtil.rewriteIVMStackTrace(err);

                delete err.stack;
                err.stack = newStack;
            }

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
        const global = this._context.global;

        this._global = global;
        await global.set("global", global.derefInto());

        this._vmObjects.push({ targetName: "global" });
    }

    async _setInfo() {
        this.setVMObject("util", Object, [FakeUtil.getInfo()]);
    }

    async _setTag(tag, args) {
        await this.setVMObject("tag", FakeTag, [tag, args], "fixedTag");
    }

    async _setMsg(msg) {
        await this.setVMObject("msg", FakeMsg, [msg], "fixedMsg");
    }

    async _setVM() {
        await this.setVMObject("vm", FakeVM, [this._isolate], "vmProps");
    }

    _constructFuncs(objMap, names) {
        let funcs = [];

        for (const [objKey, funcMap] of Object.entries(objMap)) {
            if (!funcMap) {
                throw new VMError("Invalid object map");
            }

            const objName = names.global[objKey],
                funcNames = names.func[objKey];

            if (typeof objName === "undefined") {
                throw new VMError(`Object ${objKey} not found`);
            }

            for (let [funcKey, funcProperties] of Object.entries(funcMap)) {
                const funcName = funcNames[funcKey];

                if (typeof funcName === "undefined") {
                    throw new VMError(`Function ${funcKey} not found`);
                }

                funcProperties = {
                    ...funcProperties,
                    parent: objName,
                    name: funcName
                };

                const func = new VMFunction(funcProperties, this._propertyMap);
                funcs.push(func);
            }
        }

        return funcs;
    }

    async _registerFuncs() {
        this._funcs = this._constructFuncs(Functions, {
            global: globalNames,
            func: funcNames
        });

        for (const func of this._funcs) {
            await func.register(this._context);
        }
    }

    async _setupContext(msg, tag, args) {
        this._context = await this._isolate.createContext({
            inspector: this.enableInspector
        });

        await this._setGlobal();

        await this._setInfo();
        await this._setMsg(msg);
        await this._setTag(tag, args);
        await this._setVM();

        this._propertyMap = {
            msg: this.msg,
            vm: this.vm
        };

        await this._registerFuncs();
    }

    async _setupIsolate(msg, tag, args) {
        this._isolate = new Isolate({
            memoryLimit: this.memLimit,
            inspector: this.enableInspector
        });

        await this._setupContext(msg, tag, args);

        this.inspector.create(this._isolate);
    }

    _disposeInspector() {
        this.inspector.dispose();
        delete this.inspector;
    }

    _disposeVMObjects() {
        Util.wipeArray(this._vmObjects, obj => {
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
        this._context?.release();
        delete this._context;

        delete this._propertyMap;
    }

    _disposeIsolate() {
        if (typeof this._isolate === "undefined") {
            return;
        }

        if (!this._isolate.isDisposed) {
            this._isolate.dispose();
        }

        delete this._isolate;
    }
}

export default EvalContext;
