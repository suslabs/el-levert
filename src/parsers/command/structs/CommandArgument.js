import CommandQuotedValue from "./CommandQuotedValue.js";
import CommandArgumentResult from "./CommandArgumentResult.js";
import CommandValidationIssue from "./CommandValidationIssue.js";

import CommandReaderKinds from "../reader/CommandReaderKinds.js";
import CommandTypeNames from "../type/CommandTypeNames.js";

import Util from "../../../util/Util.js";

class CommandArgument {
    constructor(name, from, reader, type, valid, lowercase, typeName) {
        this.name = name;
        this.from = from;
        this.reader = reader;
        this.type = type;
        this.valid = valid;
        this.lowercase = lowercase;
        this.typeName = typeName;
    }

    parse(session) {
        let input = this._readInput(session);
        input = this._normalizeInput(input);

        const { value, issues } = this._coerceInput(input);

        if (Util.empty(issues)) {
            issues.push(...this.validate(value, input));
        }

        return new CommandArgumentResult(this.name, input, value, Util.empty(issues), issues);
    }

    validate(value, input) {
        const issues = [],
            rules = this.valid;

        if (!rules) {
            return issues;
        }

        if (!this._validateRequired(issues, rules, value, input)) {
            return issues;
        }

        this._validateRange(issues, rules, value, input);
        this._validateLength(issues, rules, value, input);
        this._validateRegex(issues, rules, value, input);

        return issues;
    }

    _readInput(session) {
        if (this.reader) {
            return this.reader.read(session);
        }

        return session.getSourceValue(this.from);
    }

    _normalizeInput(input) {
        if (!this.lowercase) {
            return input;
        }

        if (Array.isArray(input)) {
            return input.map(value => this._normalizeSingleInput(value));
        }

        return this._normalizeSingleInput(input);
    }

    _normalizeSingleInput(input) {
        if (typeof input === "string") {
            return input.toLowerCase();
        }

        if (input && typeof input.value === "string") {
            if (typeof input.quote === "string") {
                return new CommandQuotedValue(input.value.toLowerCase(), input.quote);
            }

            return {
                ...input,
                value: input.value.toLowerCase()
            };
        }

        return input;
    }

    _coerceInput(input) {
        if (this.reader?.kind === CommandReaderKinds.list) {
            return this._coerceListInput(input);
        }

        const result = this.type.coerce(input);

        return {
            value: result.value,
            issues: this._collectTypeIssues(result)
        };
    }

    _coerceListInput(input) {
        if (!Array.isArray(input)) {
            return {
                value: [],
                issues: []
            };
        }

        const value = [],
            issues = [];

        for (const item of input) {
            const result = this.type.coerce(item);

            value.push(result.value);
            issues.push(...this._collectTypeIssues(result));
        }

        return {
            value,
            issues
        };
    }

    _collectTypeIssues(result) {
        return result.issue ? [result.issue] : [];
    }

    _validateRequired(issues, rules, value, input) {
        const required = rules.required ?? false,
            allowEmpty = rules.allowEmpty ?? false,
            empty = this._isEmptyValue(value);

        if (required && value == null) {
            issues.push(new CommandValidationIssue("required", "Argument is required", { input }));
            return false;
        }

        if (!allowEmpty && empty) {
            if (required) {
                issues.push(new CommandValidationIssue("empty", "Argument cannot be empty", { input, value }));
            }

            return false;
        }

        return value != null;
    }

    _validateRange(issues, rules, value, input) {
        if (!this._isNumericType() || typeof value !== "number" || Number.isNaN(value)) {
            return;
        }

        if (typeof rules.min === "number" && value < rules.min) {
            issues.push(new CommandValidationIssue("min", `Value must be at least ${rules.min}`, { input, value }));
        }

        if (typeof rules.max === "number" && value > rules.max) {
            issues.push(new CommandValidationIssue("max", `Value must be at most ${rules.max}`, { input, value }));
        }
    }

    _validateLength(issues, rules, value, input) {
        if (!this._hasLength()) {
            return;
        }

        const str = this._getLengthValue(value);

        if (typeof rules.minLength === "number" && str.length < rules.minLength) {
            issues.push(
                new CommandValidationIssue("minLength", `Length must be at least ${rules.minLength}`, { input, value })
            );
        }

        if (typeof rules.maxLength === "number" && str.length > rules.maxLength) {
            issues.push(
                new CommandValidationIssue("maxLength", `Length must be at most ${rules.maxLength}`, { input, value })
            );
        }
    }

    _validateRegex(issues, rules, value, input) {
        if (!this._hasLength() || !(rules.regex instanceof RegExp)) {
            return;
        }

        if (!rules.regex.test(this._getLengthValue(value))) {
            issues.push(new CommandValidationIssue("regex", "Value does not match required pattern", { input, value }));
        }
    }

    _getLengthValue(value) {
        return this.typeName === CommandTypeNames.script ? (value?.body ?? "") : String(value ?? "");
    }

    _hasLength() {
        return this.typeName === CommandTypeNames.string || this.typeName === CommandTypeNames.script;
    }

    _isNumericType() {
        return this.typeName === CommandTypeNames.integer || this.typeName === CommandTypeNames.number;
    }

    _isEmptyValue(value) {
        if (typeof value === "string") {
            return Util.empty(value);
        }

        if (this.typeName === "script") {
            return Util.empty(value?.body);
        }

        return false;
    }
}

export default CommandArgument;
