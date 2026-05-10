import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import TypeTester from "../../../util/TypeTester.js";
import CommandError from "../../../errors/CommandError.js";

class BaseCommandInfo {
    static dataProps = ["name", "parent", "subcommand", "subcommands"];

    static invalidValues = {};

    static defaultValues = {
        parent: "",
        subcommand: false,
        subcommands: []
    };

    constructor(data, overrides) {
        data = TypeTester.isObject(data) ? data : {};
        overrides = TypeTester.isObject(overrides) ? overrides : {};

        const source = typeof data.toObject === "function" ? data.toObject() : data;

        ObjectUtil.setValuesWithDefaults(
            this,
            {
                ...source,
                ...overrides
            },
            this.constructor.defaultValues
        );

        if (!this.constructor.isValidName(this.name)) {
            throw new CommandError("Command must have a name");
        } else if (this.subcommand && !Util.nonemptyString(this.parent)) {
            throw new CommandError("Subcommands must have a parent command");
        }
    }

    toObject() {
        return {
            name: this.name,
            parent: this.parent,
            subcommand: this.subcommand,
            subcommands: structuredClone(this.subcommands)
        };
    }

    static isValidName(name) {
        return Util.nonemptyString(name);
    }
}

export default BaseCommandInfo;
