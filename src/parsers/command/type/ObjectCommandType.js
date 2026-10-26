import BaseCommandType from "./BaseCommandType.js";

import CommandTypeNames from "./CommandTypeNames.js";

import TypeTester from "../../../util/TypeTester.js";

class ObjectCommandType extends BaseCommandType {
    static type = CommandTypeNames.object;

    coerce(input) {
        if (TypeTester.isObject(input) && !Array.isArray(input)) {
            return this._createSuccess(input);
        }

        const str = String(input).trim();

        try {
            const parsed = JSON.parse(str);

            if (!TypeTester.isObject(parsed) || Array.isArray(parsed)) {
                return this._createInvalid("invalid_object", "Invalid JSON object", input);
            }

            return this._createSuccess(parsed);
        } catch (err) {
            return this._createInvalid("invalid_object", "Invalid JSON object", input);
        }
    }
}

export default ObjectCommandType;
