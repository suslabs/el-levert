import Util from "../../util/Util.js";
import getRegisterCode from "../../util/vm/getRegisterCode.js";
import VMUtil from "../../util/vm/VMUtil.js";

import FuncTypes from "./FuncTypes.js";

import VMError from "../../errors/VMError.js";
import ExitError from "../../vm/isolated-vm/functionErrors/ExitError.js";

class VMFunction {
    static defaultValues = {
        singleContext: true,
        parent: "",
        type: FuncTypes.regular,
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

        Util.setValuesWithDefaults(this, options, this.constructor.defaultValues);

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
            ref = Util.bindArgs(ref, evalContext);
        }

        const res = await context.evalClosure(code, [ref], VMFunction.registerOptions);

        if (this.singleContext) {
            this.context = evalContext;
            this.registered = true;
        }

        return res;
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

        return Util.bindArgs(ref, args);
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

        const argNames = Util.functionArgumentNames(func);
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

        const errorOptions = {};

        if (this.exits) {
            errorOptions.class = this.errorClass;
        }

        this._registerCode = getRegisterCode(options, errorOptions);
        return this._registerCode;
    }
}

export default VMFunction;
