import FuncTypes from "./FuncTypes.js";

import VMError from "../../errors/VMError.js";
import ExitError from "../../vm/isolated-vm/functionErrors/ExitError.js";

import getRegisterCode from "../../util/vm/getRegisterCode.js";
import Util from "../../util/Util.js";

function resolveObj(path, propertyMap) {
    if (typeof path !== "string") {
        throw new VMError("Invalid path provided");
    }

    if (typeof propertyMap === "undefined") {
        throw new VMError("Can't resolve object, no property map provided");
    }

    const split = path.split(".");

    let parent, obj;

    while (split.length > 0) {
        parent = obj;

        const propertyName = Util.firstElement(split);

        if (typeof obj === "undefined") {
            obj = propertyMap[propertyName];
        } else {
            obj = obj[propertyName];
        }

        if (typeof obj === "undefined") {
            throw new VMError("Property not found: " + propertyName);
        }

        split.shift();
    }

    return { obj, parent };
}

const defaultValues = {
    parent: "",
    type: FuncTypes.regular,
    exits: false,
    errorClass: ExitError,
    binds: []
};

class VMFunction {
    static defaultValues = defaultValues;

    constructor(options, propertyMap) {
        if (typeof options.name === "undefined") {
            throw new VMError("VM function must have a name");
        }

        if (typeof options.ref === "undefined") {
            throw new VMError("VM function must have a reference function");
        }

        Util.setValuesWithDefaults(this, options, defaultValues);

        this.resolveReference(propertyMap);
        this.resolveBinds(propertyMap);

        this.registered = false;
    }

    resolveReference(propertyMap) {
        if (typeof this.ref === "function") {
            return;
        }

        const path = this.ref,
            { obj: refFunc, parent } = resolveObj(path, propertyMap);

        if (typeof refFunc === "undefined") {
            throw new VMError("Couldn't resolve reference function");
        }

        this.ref = refFunc.bind(parent);
    }

    resolveBinds(propertyMap) {
        if (this.binds.length === 0) {
            return;
        }

        const argList = [];

        for (const path of this.binds) {
            const obj = resolveObj(path, propertyMap).obj;
            argList.push(obj);
        }

        this.ref = Util.bindArgs(this.ref, ...argList);
    }

    getRegisterCode() {
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

    async register(context) {
        if (this.registered) {
            throw new VMError("VM function has already been registered");
        }

        this.context = context;

        const code = this.getRegisterCode(),
            res = await context.evalClosure(code, [this.ref], {
                arguments: {
                    reference: true
                }
            });

        this.registered = true;
        return res;
    }
}

export default VMFunction;
