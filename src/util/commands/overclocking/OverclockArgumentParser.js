import Overclocking from "./Overclocking.js";
import OverclockingModes, { modeNames, validModes } from "./OverclockingModes.js";

import Util from "../../Util.js";

import ParserError from "../../../errors/ParserError.js";

class OverclockArgumentParser {
    static modes = modeNames;

    static baseFields = Object.freeze([
        { name: "eu", type: "number", required: true },
        { name: "duration", type: "duration", required: true }
    ]);

    static parallelFields = Object.freeze([
        { name: "parallel", type: "integer" },
        { name: "amperage", type: "integer" }
    ]);

    static standardSchema = Object.freeze([
        ...this.baseFields,
        { name: "chance", type: "number" },
        { name: "chanceBonus", type: "number" },
        ...this.parallelFields
    ]);

    static schemas = Object.freeze({
        [OverclockingModes.standard]: this.standardSchema,
        [OverclockingModes.ebf]: Object.freeze([
            ...this.baseFields,
            { name: "recipeHeat", type: "integer", required: true },
            { name: "coilHeat", type: "integer", required: true },
            ...this.parallelFields
        ]),
        [OverclockingModes.lcr]: this.standardSchema,
        [OverclockingModes.ce]: this.standardSchema,
        [OverclockingModes.macerator]: this.standardSchema
    });

    parse(tokens) {
        if (!Array.isArray(tokens)) {
            throw new ParserError("Overclock arguments must be parsed as a token list", {
                reason: "invalid_args"
            });
        }

        if (Util.empty(tokens)) {
            throw new ParserError("Overclock input is required", {
                reason: "missing_args",
                field: "eu"
            });
        }

        const [mode, args] = this._resolveMode(tokens),
            schema = this.constructor.schemas[mode];

        return {
            mode,
            ...this._parseFields(args, schema)
        };
    }

    _resolveMode(tokens) {
        const first = String(Util.first(tokens)).toLowerCase();

        if (validModes.has(first)) {
            return [first, tokens.slice(1)];
        }

        if (this._isNumber(first)) {
            return [OverclockingModes.standard, tokens];
        }

        throw new ParserError(`Invalid recipe mode: ${first}`, {
            reason: "invalid_mode",
            mode: first
        });
    }

    _parseFields(tokens, schema) {
        const recipe = {};

        for (let i = 0; i < schema.length; i++) {
            const field = schema[i],
                token = tokens[i];

            if (this._isSkipped(token)) {
                if (field.required) {
                    this._throwMissing(field.name);
                }

                continue;
            }

            if (typeof token === "undefined") {
                if (field.required) {
                    this._throwMissing(field.name);
                }

                continue;
            }

            recipe[field.name] = this._parseField(field, token);
        }

        return recipe;
    }

    _parseField(field, token) {
        const value = this._parseValue(field.type, token);

        if (!this._isValid(field.name, value)) {
            throw new ParserError(`Invalid value for ${field.name}: ${token}`, {
                reason: "invalid_value",
                field: field.name,
                input: token
            });
        }

        return value;
    }

    _parseValue(type, token) {
        switch (type) {
            case "duration":
                return Overclocking.parseDuration(token);
            case "integer":
                return Util.parseInt(token);
            default:
                return Number.parseFloat(token);
        }
    }

    _isValid(field, value) {
        if (typeof value !== "number" || Number.isNaN(value)) {
            return false;
        }

        switch (field) {
            case "chance":
            case "chanceBonus":
                return value >= 0 && value <= 100;
            default:
                return value > 0;
        }
    }

    _isNumber(value) {
        return !Util.empty(value) && !Number.isNaN(Number(value));
    }

    _isSkipped(token) {
        return token === "-";
    }

    _throwMissing(field) {
        throw new ParserError(`Missing required argument: ${field}`, {
            reason: "missing_args",
            field
        });
    }
}

export default OverclockArgumentParser;
