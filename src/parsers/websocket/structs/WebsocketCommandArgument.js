import WebsocketCommandArgumentResult from "./WebsocketCommandArgumentResult.js";

import CommandReaderKinds from "../../command/reader/CommandReaderKinds.js";
import CommandTypeNames from "../../command/type/CommandTypeNames.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

const jsonTypeNames = {
        [CommandTypeNames.string]: "string",
        [CommandTypeNames.integer]: "integer",
        [CommandTypeNames.number]: "number",
        [CommandTypeNames.boolean]: "boolean",
        [CommandTypeNames.script]: "string",
        [CommandTypeNames.array]: "array",
        [CommandTypeNames.object]: "object",
        [CommandTypeNames.group]: "object"
    },
    numericTypeNames = new Set([CommandTypeNames.integer, CommandTypeNames.number]),
    lengthTypeNames = new Set([CommandTypeNames.string, CommandTypeNames.script]);

class WebsocketCommandArgument {
    constructor(options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        this.name = options.name;
        this.reader = options.reader;
        this.type = options.type;
        this.valid = options.valid;
        this.typeName = options.typeName;
        this.kind = options.kind;
        this.properties = options.properties;
        this.items = options.items;
        this.defaultValue = options.defaultValue;
        this.additionalProperties = options.additionalProperties;
    }

    createResult(rawData, coercedData, issues) {
        const rawValue = this.reader.read(rawData),
            value = this.reader.read(coercedData),
            argIssues = issues.filter(issue => this._matchesIssue(issue));

        return new WebsocketCommandArgumentResult(this.name, rawValue, value, Util.empty(argIssues), argIssues);
    }

    getJsonSchema() {
        const schema = {};

        this._applyJsonType(schema);
        this._applyProperties(schema);
        this._applyItems(schema);
        this._applyEnumValues(schema);
        this._applyValidation(schema);
        this._applyDefault(schema);

        return schema;
    }

    isRequired() {
        return this.valid?.required ?? false;
    }

    _matchesIssue(issue) {
        const path = issue.ref.instancePath ?? "";

        return path === `/${this.name}` || path.startsWith(`/${this.name}/`);
    }

    _applyJsonType(schema) {
        if (this.typeName === CommandTypeNames.any) {
            return;
        }

        const jsonType = jsonTypeNames[this.kind === CommandReaderKinds.group ? CommandTypeNames.group : this.typeName];

        if (typeof jsonType === "undefined") {
            return;
        }

        schema.type = this.isRequired() ? jsonType : [jsonType, "null"];
    }

    _applyProperties(schema) {
        if (this.kind !== CommandReaderKinds.group) {
            return;
        }

        const properties = {},
            required = [];

        for (const [key, value] of Object.entries(this.properties ?? {})) {
            const arg = new WebsocketCommandArgument({
                ...value,
                name: key
            });

            properties[key] = arg.getJsonSchema();

            if (arg.isRequired()) {
                required.push(key);
            }
        }

        schema.properties = properties;
        schema.additionalProperties = this.additionalProperties ?? false;

        if (!Util.empty(required)) {
            schema.required = required;
        }
    }

    _applyItems(schema) {
        if (this.typeName !== "array" || !this.items) {
            return;
        }

        schema.items = new WebsocketCommandArgument({
            ...this.items,
            name: this.items.name ?? this.name
        }).getJsonSchema();
    }

    _applyEnumValues(schema) {
        if (this.typeName !== "enum") {
            return;
        }

        const values = this.type?.options?.values ?? this.type?.values;

        if (Array.isArray(values)) {
            schema.enum = values;
        }
    }

    _applyValidation(schema) {
        const rules = this.valid;

        if (!rules) {
            return;
        }

        this._applyRangeValidation(schema, rules);
        this._applyLengthValidation(schema, rules);
        this._applyRegexValidation(schema, rules);
        this._applyEmptyValidation(schema, rules);
    }

    _applyRangeValidation(schema, rules) {
        if (!numericTypeNames.has(this.typeName)) {
            return;
        }

        if (typeof rules.min === "number") {
            schema.minimum = rules.min;
        }

        if (typeof rules.max === "number") {
            schema.maximum = rules.max;
        }
    }

    _applyLengthValidation(schema, rules) {
        if (!lengthTypeNames.has(this.typeName)) {
            return;
        }

        if (typeof rules.minLength === "number") {
            schema.minLength = rules.minLength;
        }

        if (typeof rules.maxLength === "number") {
            schema.maxLength = rules.maxLength;
        }
    }

    _applyRegexValidation(schema, rules) {
        if (!lengthTypeNames.has(this.typeName) || !(rules.regex instanceof RegExp)) {
            return;
        }

        schema.pattern = rules.regex.source;
    }

    _applyEmptyValidation(schema, rules) {
        if (rules.allowEmpty !== false) {
            return;
        }

        if (lengthTypeNames.has(this.typeName)) {
            schema.minLength = Math.max(schema.minLength ?? 0, 1);
            return;
        }

        if (this.typeName === CommandTypeNames.array) {
            schema.minItems = 1;
        }
    }

    _applyDefault(schema) {
        if (typeof this.defaultValue === "undefined") {
            return;
        }

        schema.default = this.defaultValue;
    }
}

export default WebsocketCommandArgument;
