import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import FunctionUtil from "../../util/misc/FunctionUtil.js";
import getRegisterCode from "../../util/vm/getRegisterCode.js";
import VMUtil from "../../util/vm/VMUtil.js";

import { FuncTypes, ExecutionTypes } from "./FuncTypes.js";

import VMError from "../../errors/VMError.js";
import ExitError from "../../vm/isolated-vm/functionErrors/ExitError.js";

class VMFunction {
    static defaultValues = {
        singleContext: true,
        parent: "",
        type: FuncTypes.regular,
        execution: ExecutionTypes.bot,
        exits: false,
        errorClass: ExitError,
        binds: [],
        otherRefs: []
    };

    static pathPrefix = "path:";

    static registerOptions = {
        arguments: {
            reference: true
        }
    };

    static callOptions = {
        arguments: {
            copy: true
        }
    };

    constructor(options, propertyMap) {
        if (typeof options.name !== "string") {
            throw new VMError("VM function must have a name");
        } else if (typeof options.ref === "undefined") {
            throw new VMError("VM function must have a reference function");
        }

        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        if (!Object.values(FuncTypes).includes(this.type)) {
            throw new VMError("Invalid function type provided: " + this.type, this.type);
        }

        switch (this.execution) {
            case ExecutionTypes.bot:
                this._stringFunc = false;

                if (!Util.empty(this.otherRefs)) {
                    throw new VMError("Other refs are only allowed for script functions", this.otherRefs);
                }

                break;
            case ExecutionTypes.script:
                this._stringFunc = true;
                break;
            default:
                throw new VMError("Invalid execution type provided: " + this.execution, this.execution);
        }

        if (this.singleContext) {
            this.ref = this._getRefFunc(propertyMap);
            this.otherRefs = this._getOtherRefs(propertyMap);
            this._resolved = true;

            this.takesContext = this._takesContext();
            this.registered = false;
        } else {
            this._getRegisterCode();
            this._resolved = false;
        }
    }

    async register(evalContext, propertyMap) {
        if (this.singleContext && this.registered) {
            throw new VMError("VM function has already been registered", this.name);
        }

        evalContext = this.context ?? evalContext;
        propertyMap = this.propertyMap ?? propertyMap;

        const code = this._getRegisterCode(),
            vmContext = evalContext.context;

        let ref = this._stringFunc ? null : this._getRefFunc(propertyMap),
            otherRefs = this._getOtherRefs(propertyMap);

        if (this._takesContext(ref)) {
            ref = FunctionUtil.bindArgs(ref, evalContext);
        }

        const evalRefs = [ref].concat(otherRefs).filter(Boolean);
        await vmContext.evalClosure(code, evalRefs, VMFunction.registerOptions);

        if (this.singleContext) {
            this.context = evalContext;
            this.registered = true;
        }
    }

    static _resolveReference(ref, propertyMap) {
        if (typeof ref === "function") {
            return ref;
        } else if (typeof ref !== "string" || !ref.startsWith(VMFunction.pathPrefix)) {
            throw new VMError("Invalid reference function path", ref);
        }

        let path = ref.slice(VMFunction.pathPrefix.length),
            parent;

        ({ obj: ref, parent } = VMUtil.resolveObject(path, propertyMap));

        if (typeof ref === "undefined") {
            throw new VMError("Couldn't resolve reference function");
        }

        return ref.bind(parent);
    }

    static _resolveBinds(func, binds, propertyMap) {
        if (typeof func !== "function") {
            throw new VMError("Can't bind unresolved ref function");
        } else if (!Array.isArray(binds) || Util.empty(binds)) {
            return func;
        }

        const args = binds.map(bind => {
            if (typeof bind !== "string" || !bind.startsWith(VMFunction.pathPrefix)) {
                return bind;
            }

            const path = bind.slice(VMFunction.pathPrefix.length);
            return VMUtil.resolveObject(path, propertyMap).obj;
        });

        return FunctionUtil.bindArgs(func, args);
    }

    _getRefFunc(propertyMap) {
        if (this._resolved) {
            return this.ref;
        }

        let func = VMFunction._resolveReference(this.ref, propertyMap);
        func = VMFunction._resolveBinds(func, this.binds, propertyMap);

        return func;
    }

    _takesContext(func) {
        if (typeof this.takesContext !== "undefined") {
            return this.takesContext;
        }

        func ??= this.ref;

        if (typeof func !== "function") {
            return false;
        }

        const argNames = FunctionUtil.functionArgumentNames(func);
        return Util.first(argNames) === "context";
    }

    _getRegisterCode() {
        if (typeof this._registerCode !== "undefined") {
            return this._registerCode;
        }

        const options = {
            objName: this.parent,
            funcName: this.name,
            type: this.type
        };

        const funcOptions = {
            stringFunc: this._stringFunc,
            func: this._stringFunc ? this.ref : undefined
        };

        const errorOptions = {
            class: this.exits ? this.errorClass : undefined
        };

        this._registerCode = getRegisterCode(options, funcOptions, errorOptions);
        return this._registerCode;
    }

    _getOtherRefs(propertyMap) {
        if (!this._stringFunc || this._resolved) {
            return [];
        }

        return this.otherRefs.map(ref => {
            let func = VMFunction._resolveReference(ref.ref, propertyMap);
            func = VMFunction._resolveBinds(func, ref.binds ?? [], propertyMap);

            return func;
        });
    }
}

export default VMFunction;
