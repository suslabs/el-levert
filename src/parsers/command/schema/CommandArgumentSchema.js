import Ajv from "ajv";

import jsonSchema from "./jsonSchema.js";
import arraySchema from "./arraySchema.js";
import commandArgumentShorthands from "./commandArgumentShorthands.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import CommandError from "../../../errors/CommandError.js";

class CommandArgumentSchema {
    static compile(args) {
        if (!Array.isArray(args)) {
            throw new CommandError("Command arguments definition must be an array");
        }

        const normalizedArgs = args.map(arg => this._normalizeArgument(arg));

        if (!this._validateArgs(normalizedArgs)) {
            const err = Util.first(this._validateArgs.errors),
                path = err.instancePath || "unknown";

            throw new CommandError(`Invalid argument schema at ${path}: ${err.message}`);
        }

        this._validateEnumTypes(normalizedArgs);
        return normalizedArgs;
    }

    static _ajv = null;
    static _validateArgs = null;

    static {
        this._ajv = new Ajv({
            allErrors: true,
            strict: true,
            validateSchema: true
        });

        this._ajv.addKeyword({
            keyword: "isRegExp",
            validate: (schema, data) => data instanceof RegExp
        });

        this._ajv.addSchema(jsonSchema);
        this._validateArgs = this._ajv.compile(arraySchema);
    }

    static _normalizeArgument(rawArg) {
        const arg = {
            ...ObjectUtil.guaranteeObject(rawArg)
        };

        arg.from ??= "args";
        arg.type = this._normalizeType(arg.type ?? "string");

        this._normalizeValid(arg);
        this._normalizeGroup(arg);
        this._normalizeReader(arg);
        this._normalizeGroupProperties(arg);

        if (Util.empty(Object.keys(arg.valid ?? {}))) {
            delete arg.valid;
        }

        return ObjectUtil.removeUndefinedValues(arg);
    }

    static _normalizeType(type) {
        if (typeof type !== "string") {
            return type;
        }

        return commandArgumentShorthands.type.fields[type] ?? type;
    }

    static _normalizeValid(arg) {
        this._normalizeContainerShorthand(arg, "valid");
    }

    static _normalizeGroup(arg) {
        if (!Object.hasOwn(arg, "properties")) {
            return;
        }

        const readerShorthands = this._getTopLevelShorthandFields(arg, "reader"),
            hasReader = Object.hasOwn(arg, "reader");

        if (hasReader || readerShorthands.some(name => name !== "kind")) {
            throw new CommandError(`Argument "${arg.name}" cannot declare reader fields on a group argument`);
        }

        if (Object.hasOwn(arg, "kind") && arg.kind !== "group") {
            throw new CommandError(`Argument "${arg.name}" must declare kind "group" when using properties`);
        }

        delete arg.reader;
        arg.kind = "group";
    }

    static _normalizeReader(arg) {
        if (arg.kind === "group") {
            return;
        }

        this._normalizeContainerShorthand(arg, "reader");

        if (!Object.hasOwn(arg, "reader")) {
            return;
        }

        if (typeof arg.reader.kind === "undefined") {
            throw new CommandError(`Argument "${arg.name}" reader shorthand must declare kind`);
        }

        arg.reader = ObjectUtil.removeUndefinedValues({
            ...ObjectUtil.guaranteeObject(arg.reader)
        });
    }

    static _normalizeGroupProperties(arg) {
        if (arg.kind !== "group") {
            return;
        }

        const properties = {};

        for (const [key, value] of Object.entries(ObjectUtil.guaranteeObject(arg.properties))) {
            properties[key] = this._normalizeArgument({
                ...ObjectUtil.guaranteeObject(value),
                name: key
            });
        }

        arg.properties = properties;
    }

    static _normalizeContainerShorthand(arg, name) {
        const defs = commandArgumentShorthands[name],
            fieldDefs = defs.fields,
            fieldNames = Array.isArray(fieldDefs) ? fieldDefs : Object.keys(fieldDefs);

        const hasContainer = Object.hasOwn(arg, name),
            container = {
                ...ObjectUtil.guaranteeObject(arg[name])
            };

        let usedShorthand = false;

        for (const prop of fieldNames) {
            if (!Object.hasOwn(arg, prop)) {
                continue;
            }

            usedShorthand = true;

            const placement = Array.isArray(fieldDefs)
                ? defs.placement
                : (fieldDefs[prop]?.placement ?? defs.placement);

            if (placement === "inside") {
                throw new CommandError(`Argument "${arg.name}" must declare "${prop}" inside ${name}`);
            }

            if (placement === "exclusive" && hasContainer) {
                throw new CommandError(`Argument "${arg.name}" cannot mix ${name} with top-level ${prop}`);
            }

            this._setContainerField(container, arg, prop);
        }

        if (!hasContainer && !usedShorthand) {
            return;
        }

        arg[name] = ObjectUtil.removeUndefinedValues(container);
    }

    static _setContainerField(container, arg, prop) {
        const value = arg[prop];
        delete arg[prop];

        if (Object.hasOwn(container, prop) && container[prop] !== value) {
            throw new CommandError(`Argument "${arg.name}" has conflicting ${prop} declarations`);
        }

        container[prop] ??= value;
    }

    static _getTopLevelShorthandFields(arg, name) {
        const { fields } = commandArgumentShorthands[name],
            fieldNames = Array.isArray(fields) ? fields : Object.keys(fields);

        return fieldNames.filter(prop => Object.hasOwn(arg, prop));
    }

    static _validateEnumTypes(args) {
        for (const arg of args) {
            this._validateEnumType(arg);

            if (arg.kind === "group") {
                this._validateEnumTypes(Object.values(arg.properties ?? {}));
            }
        }
    }

    static _validateEnumType(arg) {
        const type = arg.type;

        if (typeof type !== "object" || type === null || type.name !== "enum") {
            return;
        }

        const values = type.values ?? [];

        if (Util.empty(values)) {
            return;
        }

        const expectedType = typeof Util.first(values);

        if (!values.every(value => typeof value === expectedType)) {
            throw new CommandError(`Argument "${arg.name}" enum values must all be of the same type`);
        }
    }
}

export default CommandArgumentSchema;
