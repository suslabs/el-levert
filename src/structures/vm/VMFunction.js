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
        binds: []
    };

    static registerOptions = {
        arguments: {
            reference: true
        }
    };

    constructor(options, propertyMap) {
        if (typeof options.name !== "string") {
            throw new VMError("VM function must have a name");
        }

        if (typeof options.ref === "undefined") {
            throw new VMError("VM function must have a reference function");
        }

        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        switch (this.execution) {
            case ExecutionTypes.bot:
                this._stringFunc = false;
                break;
            case ExecutionTypes.script:
                this._stringFunc = true;
                break;
        }

        if (this.singleContext) {
            this.ref = this._getRefFunc(propertyMap);
            this._resolved = true;
            this.registered = false;
        } else {
            this._getRegisterCode();
            this._resolved = false;
        }

        this.takesContext = this._takesContext();
    }

    async register(evalContext, propertyMap) {
        if (this.singleContext && this.registered) {
            throw new VMError("VM function has already been registered");
        }

        evalContext = this.context ?? evalContext;
        propertyMap = this.propertyMap ?? propertyMap;

        const context = evalContext.context,
            code = this._getRegisterCode();

        let ref = this._getRefFunc(propertyMap),
            takesContext = this._takesContext(ref);

        if (takesContext) {
            ref = FunctionUtil.bindArgs(ref, evalContext);
        }

        if (this._stringFunc) {
            await context.evalClosure(code);
        } else {
            await context.evalClosure(code, [ref], VMFunction.registerOptions);
        }

        if (this.singleContext) {
            this.context = evalContext;
            this.registered = true;
        }
    }

    _resolveReference(propertyMap) {
        const path = this.ref,
            { obj: ref, parent } = VMUtil.resolveObject(path, propertyMap);

        if (typeof ref === "undefined") {
            throw new VMError("Couldn't resolve reference function");
        }

        return ref.bind(parent);
    }

    _resolveBinds(ref, propertyMap) {
        if (Util.empty(this.binds)) {
            return ref;
        }

        const args = [];

        for (const path of this.binds) {
            const { obj } = VMUtil.resolveObject(path, propertyMap);
            args.push(obj);
        }

        return FunctionUtil.bindArgs(ref, args);
    }

    _getRefFunc(propertyMap) {
        if (this._resolved) {
            return this.ref;
        }

        let ref;

        if (typeof this.ref === "function") {
            ref = this.ref;
        } else {
            ref = this._resolveReference(propertyMap);
        }

        return this._resolveBinds(ref, propertyMap);
    }

    _takesContext(func) {
        if (typeof this.takesContext !== "undefined") {
            return this.takesContext;
        }

        func = this.ref ?? func;

        if (typeof func !== "function") {
            return;
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

        const errorOptions = {};

        if (this.exits) {
            errorOptions.class = this.errorClass;
        }

        this._registerCode = getRegisterCode(options, funcOptions, errorOptions);
        return this._registerCode;
    }
}

export default VMFunction;
