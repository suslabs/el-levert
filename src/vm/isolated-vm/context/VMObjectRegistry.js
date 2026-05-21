import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import globalNames from "./globalNames.json" assert { type: "json" };

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";

import VMError from "../../../errors/VMError.js";

class VMObjectRegistry {
    constructor() {
        this.objects = [];
    }

    async create(context) {
        this.context = context;
        this.global = context.global;

        await this.global.set("global", this.global.derefInto());
    }

    async set(name, _class, params, targetProp) {
        if (!Util.nonemptyString(name)) {
            throw new VMError("No object name provided");
        } else if (this._findObject(name) !== -1) {
            throw new VMError(`Object ${name} already exists`, name);
        }

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
        await this.global.set(vmName, vmObj.copyInto());

        this[name] = obj;
        this[targetName] = vmObj;

        this.objects.push({ name, targetName });
    }

    delete(name, errorIfNotFound = true) {
        if (!Util.nonemptyString(name)) {
            throw new VMError("No object name provided");
        }

        const idx = this._findObject(name);

        if (idx === -1) {
            return errorIfNotFound
                ? () => {
                      throw new VMError(`Object ${name} not found`, name);
                  }
                : null;
        }

        const obj = this.objects[idx];
        this._disposeObject(obj);

        this.objects.splice(idx, 1);
        return obj;
    }

    dispose() {
        ArrayUtil.wipeArray(this.objects, obj => this._disposeObject(obj));

        delete this.global;
        delete this.context;
    }

    _findObject(name) {
        return this.objects.findIndex(obj => obj.name === name);
    }

    _disposeObject(obj) {
        if (typeof obj.name !== "undefined") {
            delete this[obj.name];
        }

        if (typeof obj.targetName !== "undefined") {
            this[obj.targetName]?.release();
            delete this[obj.targetName];
        }
    }
}

export default VMObjectRegistry;
