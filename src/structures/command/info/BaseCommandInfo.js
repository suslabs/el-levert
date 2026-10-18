import BaseStructure from "../../BaseStructure.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import CommandError from "../../../errors/CommandError.js";

class BaseCommandInfo extends BaseStructure {
    static invalidValues = {};

    static defaultValues = {
        parent: "",
        subcommand: false,
        subcommands: []
    };

    static dataProps = ["name", "parent", "subcommand", "subcommands"];

    static isValidName(name) {
        return Util.nonemptyString(name);
    }

    constructor(data, overrides) {
        data = ObjectUtil.guaranteeObject(data);
        const source = typeof data.getData === "function" ? data.getData() : data;

        super(overrides != null ? { ...source, ...overrides } : source);

        if (!this.constructor.isValidName(this.name)) {
            throw new CommandError("Command must have a name");
        } else if (this.subcommand && !Util.nonemptyString(this.parent)) {
            throw new CommandError("Subcommands must have a parent command");
        }
    }
}

export default BaseCommandInfo;
