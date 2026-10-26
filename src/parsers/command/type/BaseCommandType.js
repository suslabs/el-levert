import CommandValidationIssue from "../structs/CommandValidationIssue.js";

import CommandTypeNames from "./CommandTypeNames.js";

import ObjectUtil from "../../../util/ObjectUtil.js";
import TypeTester from "../../../util/TypeTester.js";

class BaseCommandType {
    static type = CommandTypeNames.any;

    constructor(options = {}) {
        this.options = ObjectUtil.guaranteeObject(options);

        this._childCoerce = this.coerce;
        this.coerce = this._coerce.bind(this);
    }

    coerce(input) {
        let value = input;

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (
                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                (trimmed.startsWith("[") && trimmed.endsWith("]"))
            ) {
                try {
                    value = JSON.parse(trimmed);
                } catch (err) {}
            }
        }

        return this._createSuccess(value);
    }

    _coerce(input) {
        if (input == null) {
            return this._createSuccess(input);
        }

        return this._childCoerce(this._unwrapInput(input), input);
    }

    _unwrapInput(input) {
        if (TypeTester.isObject(input) && "value" in input && "quote" in input) {
            return input.value;
        }

        return input;
    }

    _createInvalid(code, message, input, value = null) {
        return {
            value,
            issue: new CommandValidationIssue(code, message, { input, value })
        };
    }

    _createSuccess(value) {
        return {
            value,
            issue: null
        };
    }
}

export default BaseCommandType;
