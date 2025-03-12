import FuncTypes from "./FuncTypes.js";

import VMError from "../../errors/VMError.js";
import ExitError from "../../vm/isolated-vm/functionErrors/ExitError.js";

import getRegisterCode from "../../util/vm/getRegisterCode.js";
import Util from "../../util/Util.js";

class VMFunction {
    static defaultValues = {
        parent: "",
        type: FuncTypes.regular,
        exits: false,
        errorClass: ExitError,
        binds: []
    };

    constructor(options, propertyMap) {
        if (typeof options.name === "undefined") {
            throw new VMError("VM function must have a name");
        }

        if (typeof options.ref === "undefined") {
            throw new VMError("VM function must have a reference function");
        }

        Util.setValuesWithDefaults(this, options, VMFunction.defaultValues);

        this._resolveReference(propertyMap);
        this._resolveBinds(propertyMap);

        this.registered = false;
    }

    async register(context) {
        if (this.registered) {
            throw new VMError("VM function has already been registered");
        }

        this.context = context;

        const code = this._getRegisterCode(),
            res = await context.evalClosure(code, [this.ref], {
                arguments: {
                    reference: true
                }
            });

        this.registered = true;
        return res;
    }

    _resolveReference(propertyMap) {
        if (typeof this.ref === "function") {
            return;
        }

        const path = this.ref,
            { obj: refFunc, parent } = Util.resolveObj(path, propertyMap);

        if (typeof refFunc === "undefined") {
            throw new VMError("Couldn't resolve reference function");
        }

        this.ref = refFunc.bind(parent);
    }

    _resolveBinds(propertyMap) {
        if (Util.empty(this.binds)) {
            return;
        }

        const argList = [];

        for (const path of this.binds) {
            const obj = Util.resolveObj(path, propertyMap).obj;
            argList.push(obj);
        }

        this.ref = Util.bindArgs(this.ref, ...argList);
    }

    _getRegisterCode() {
        const options = {
            objName: this.parent,
            funcName: this.name,
            type: this.type
        };

        let errorOptions;

        if (this.exits) {
            errorOptions = {
                class: this.errorClass,
                accessible: false
            };
        }

        return getRegisterCode(options, errorOptions);
    }
}

export default VMFunction;
