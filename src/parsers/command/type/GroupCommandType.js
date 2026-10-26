import BaseCommandType from "./BaseCommandType.js";

import CommandTypeNames from "./CommandTypeNames.js";

import TypeTester from "../../../util/TypeTester.js";

class GroupCommandType extends BaseCommandType {
    static type = CommandTypeNames.group;

    coerce(input) {
        if (!TypeTester.isObject(input) || Array.isArray(input)) {
            return this._createInvalid("invalid_group", "Value must be an object", input);
        }

        return this._createSuccess(input);
    }
}

export default GroupCommandType;
