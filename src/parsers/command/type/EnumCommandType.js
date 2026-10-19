import BaseCommandType from "./BaseCommandType.js";

import CommandTypeNames from "./CommandTypeNames.js";

import Util from "../../../util/Util.js";

class EnumCommandType extends BaseCommandType {
    static type = CommandTypeNames.enum;

    coerce(input) {
        const values = this.options.values ?? [];

        if (Util.empty(values)) {
            return this._createInvalid("invalid_enum", "Enum has no valid values", input);
        }

        const kind = typeof Util.first(values);

        let coerced;

        switch (kind) {
            case "string":
                coerced = String(input);
                break;
            case "number":
                coerced = Number(input);

                if (Number.isNaN(coerced)) {
                    return this._createInvalid("invalid_enum", `Value must be one of: ${values.join(", ")}`, input);
                }

                break;
            case "boolean":
                if (typeof input === "boolean") {
                    coerced = input;
                } else {
                    coerced = Util.parseBool(String(input), null);

                    if (coerced === null) {
                        return this._createInvalid("invalid_enum", `Value must be one of: ${values.join(", ")}`, input);
                    }
                }

                break;
            default:
                coerced = input;
                break;
        }

        if (!values.includes(coerced)) {
            return this._createInvalid("invalid_enum", `Value must be one of: ${values.join(", ")}`, input);
        }

        return this._createSuccess(coerced);
    }
}

export default EnumCommandType;
