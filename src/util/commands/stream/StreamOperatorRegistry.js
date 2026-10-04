import StreamOperators from "./StreamOperators.js";

import Util from "../../Util.js";
import TypeTester from "../../TypeTester.js";

import UtilError from "../../../errors/UtilError.js";

class StreamOperatorRegistry {
    static register(operator, handler) {
        this._ensureInit();

        let name, fn;

        if (TypeTester.isObject(operator)) {
            name = operator.name;
            fn = operator.execute ?? operator.handler;
        } else {
            name = operator;
            fn = handler;
        }

        if (!Util.nonemptyString(name)) {
            throw new UtilError("Invalid operator name", name);
        }

        if (typeof fn !== "function") {
            throw new UtilError("Operator handler must be a function", fn);
        }

        this._operators.set(name.toLowerCase(), fn);
    }

    static load(operators) {
        for (const op of operators) {
            this.register(op);
        }
    }

    static unregister(name) {
        this._ensureInit();

        if (!Util.nonemptyString(name)) {
            return false;
        }

        return this._operators.delete(name.toLowerCase());
    }

    static has(name) {
        this._ensureInit();

        if (!Util.nonemptyString(name)) {
            return false;
        }

        return this._operators.has(name.toLowerCase());
    }

    static get(name) {
        this._ensureInit();

        if (!Util.nonemptyString(name)) {
            return null;
        }

        return this._operators.get(name.toLowerCase()) ?? null;
    }

    static getNames() {
        this._ensureInit();

        return Array.from(this._operators.keys());
    }

    static async execute(name, input, args, msg, options) {
        this._ensureInit();

        const handler = this.get(name);

        if (handler === null) {
            throw new UtilError("Unknown stream operator", name);
        }

        return await handler(input, args, msg, options);
    }

    static _operators = new Map();
    static _initialized = false;

    static _ensureInit() {
        if (!this._initialized) {
            this._initialized = true;
            this.load(StreamOperators);
        }
    }
}

export default StreamOperatorRegistry;
