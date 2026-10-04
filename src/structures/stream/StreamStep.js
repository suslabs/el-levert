import PositionalCommandReader from "../../parsers/command/reader/PositionalCommandReader.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import StreamOperatorRegistry from "../../util/commands/stream/StreamOperatorRegistry.js";

import TagError from "../../errors/TagError.js";

class StreamStep {
    static parse(stepText) {
        if (!Util.nonemptyString(stepText)) {
            throw new TagError("Empty step in pipeline");
        }

        const trimmed = stepText.trim(),
            [name, args] = PositionalCommandReader.split(trimmed);

        if (Util.empty(name)) {
            throw new TagError("Empty step in pipeline");
        }

        return new this({
            name,
            args: args.trim(),
            raw: trimmed
        });
    }

    constructor(data = {}) {
        data = ObjectUtil.guaranteeObject(data);

        this.name = data.name ?? "";
        this.args = data.args ?? "";
        this.raw = data.raw ?? "";
    }

    isOperator() {
        return StreamOperatorRegistry.has(this.name.toLowerCase());
    }

    formatArgs(input, isFirstStep = false, initialInput = "") {
        if (isFirstStep) {
            if (Util.empty(initialInput)) {
                return this.args;
            }

            if (this.args.includes("$")) {
                return this.args.replaceAll("$", initialInput).trim();
            }

            return [initialInput, this.args].filter(Util.nonemptyString).join(" ");
        }

        const inputStr =
            typeof input === "string"
                ? input
                : TypeTester.isObject(input) || Array.isArray(input)
                  ? JSON.stringify(input)
                  : String(input ?? "");

        if (this.args.includes("$")) {
            return this.args.replaceAll("$", inputStr).trim();
        }

        return [inputStr, this.args].filter(Util.nonemptyString).join(" ");
    }

    async execute(input, options = {}, stepIndex = 0, initialInput = "") {
        options = ObjectUtil.guaranteeObject(options);

        if (this.isOperator()) {
            return await this._executeOperator(input, options, stepIndex, initialInput);
        }

        return await this._executeTag(input, options, stepIndex, initialInput);
    }

    async _executeOperator(input, options, stepIndex, initialInput) {
        const opName = this.name.toLowerCase(),
            msg = options.values?.msg ?? options.msg ?? null,
            opArgs = this.args;

        let opInput = input;

        if (opName !== "head" && opName !== "tail" && stepIndex === 0 && Util.empty(initialInput)) {
            opInput = this.args;
        }

        return await StreamOperatorRegistry.execute(opName, opInput, opArgs, msg, options);
    }

    async _executeTag(input, options, stepIndex, initialInput) {
        const stepArgs = this.formatArgs(input, stepIndex === 0, initialInput),
            stepTag = await getClient().tagManager.fetch(this.name);

        if (stepTag === null) {
            throw new TagError("Hop not found", this.name);
        }

        return await getClient().tagManager.execute(stepTag, stepArgs, options.values, options.options);
    }
}

export default StreamStep;
