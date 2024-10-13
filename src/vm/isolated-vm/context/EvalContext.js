import ivm from "isolated-vm";
const { Isolate, ExternalCopy } = ivm;

import FakeTag from "../classes/FakeTag.js";
import FakeMsg from "../classes/FakeMsg.js";
import FakeVM from "../classes/FakeVM.js";

import VMFunction from "../../../structures/vm/VMFunction.js";
import VMError from "../../../errors/VMError.js";

import Functions from "./Functions.js";
import globalNames from "./globalNames.json" assert { type: "json" };
import funcNames from "./funcNames.json" assert { type: "json" };

import Util from "../../../util/Util.js";
import IsolateInspector from "../inspector/IsolateInspector.js";

const filename = "script.js";

class EvalContext {
    constructor(options, inspectorOptions = {}) {
        this.memLimit = options.memLimit;
        this.timeLimit = options.timeLimit;

        this.setupInspector(inspectorOptions);
        this.vmObjects = [];
    }

    setupInspector(options) {
        const enableInspector = options.enable ?? false;

        this.inspector = new IsolateInspector(enableInspector, options);
        this.enableInspector = enableInspector;
    }

    async setGlobal() {
        const global = this.context.global;

        this.global = global;
        await global.set("global", global.derefInto());

        this.vmObjects.push({ targetName: "global" });
    }

    async setVMObject(name, _class, params, targetProp = "this") {
        const obj = new _class(...params),
            targetObj = targetProp === "this" ? obj : obj[targetProp];

        if (typeof targetObj === "undefined") {
            throw new VMError(`Invalid target property "${targetProp}" on object: ${name}`);
        }

        const targetName = "vm" + Util.capitalize(name),
            vmName = globalNames[name];

        if (typeof vmName === "undefined") {
            throw new VMError("Unknown global object: " + name);
        }

        const vmObj = new ExternalCopy(targetObj);
        await this.global.set(vmName, vmObj.copyInto());

        this[name] = obj;
        this[targetName] = vmObj;

        this.vmObjects.push({ name, targetName });
    }

    async setTag(tag, args) {
        await this.setVMObject("tag", FakeTag, [tag, args], "fixedTag");
    }

    async setMsg(msg) {
        await this.setVMObject("msg", FakeMsg, [msg], "fixedMsg");
    }

    async setVM() {
        await this.setVMObject("vm", FakeVM, [this.isolate], "vmProps");
    }

    constructFuncs(objMap, names) {
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

                const func = new VMFunction(funcProperties, this.propertyMap);
                funcs.push(func);
            }
        }

        return funcs;
    }

    async registerFuncs() {
        this.funcs = this.constructFuncs(Functions, {
            global: globalNames,
            func: funcNames
        });

        for (const func of this.funcs) {
            await func.register(this.context);
        }
    }

    async setupContext(msg, tag, args) {
        this.context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        await this.setGlobal();

        await this.setMsg(msg);
        await this.setTag(tag, args);
        await this.setVM();

        this.propertyMap = {
            msg: this.msg,
            vm: this.vm
        };

        await this.registerFuncs();
    }

    async setupIsolate(msg, tag, args) {
        this.isolate = new Isolate({
            memoryLimit: this.memLimit,
            inspector: this.enableInspector
        });

        await this.setupContext(msg, tag, args);

        this.inspector.create(this.isolate);
    }

    async getIsolate(options) {
        const { msg, tag, args } = options;

        await this.setupIsolate(msg, tag, args);
        return this.isolate;
    }

    async compileScript(code, setReference = true) {
        code = this.inspector.getDebuggerCode(code);

        const script = await this.isolate.compileScript(code, {
            filename: `file:///${filename}`
        });

        if (setReference) {
            this.script = script;
        } else {
            return script;
        }
    }

    async runScript(code) {
        let compileNow = typeof code !== "undefined",
            script;

        if (compileNow) {
            script = await this.compileScript(code, false);
        } else if (typeof this.script === "undefined") {
            throw new VMError("Can't run script, no script was compiled");
        } else {
            script = this.script;
        }

        await this.inspector.waitForConnection();

        const res = await script.run(this.context, {
            timeout: this.timeLimit / Util.durationSeconds.milli,
            copy: true
        });

        if (compileNow) {
            script.release();
        }

        return res;
    }

    disposeInspector() {
        this.inspector.dispose();
        delete this.inspector;
    }

    disposeVMObjects() {
        Util.wipeArray(this.vmObjects, obj => {
            if (typeof obj.name !== "undefined") {
                delete this[obj.name];
            }

            if (typeof obj.targetName !== "undefined") {
                this[obj.targetName]?.release();
                delete this[obj.targetName];
            }
        });
    }

    disposeScript() {
        this.script?.release();
        delete this.script;
    }

    disposeContext() {
        this.context?.release();
        delete this.context;

        delete this.propertyMap;
    }

    disposeIsolate() {
        if (typeof this.isolate === "undefined") {
            return;
        }

        if (!this.isolate.isDisposed) {
            this.isolate.dispose();
        }

        delete this.isolate;
    }

    dispose() {
        this.disposeInspector();
        this.disposeVMObjects();
        this.disposeScript();
        this.disposeIsolate();
    }
}

export default EvalContext;
