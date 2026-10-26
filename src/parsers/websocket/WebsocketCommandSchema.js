import Ajv from "ajv";

import commandArgumentShorthands from "../command/schema/commandArgumentShorthands.js";

import CommandReaderKinds from "../command/reader/CommandReaderKinds.js";
import CommandTypeNames from "../command/type/CommandTypeNames.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import CommandError from "../../errors/CommandError.js";

const typeSchema = {
    oneOf: [
        {
            type: "string",
            enum: Object.values(CommandTypeNames).filter(name => name !== CommandTypeNames.group)
        },
        {
            type: "object",
            required: ["name"],
            additionalProperties: false,
            properties: {
                name: {
                    type: "string",
                    const: CommandTypeNames.enum
                },
                values: {
                    type: "array",
                    minItems: 1,
                    items: {
                        anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
                    }
                }
            }
        }
    ]
};

const validSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        required: {
            type: "boolean"
        },
        allowEmpty: {
            type: "boolean"
        },
        min: {
            type: "number"
        },
        max: {
            type: "number"
        },
        minLength: {
            type: "integer",
            minimum: 0
        },
        maxLength: {
            type: "integer",
            minimum: 0
        },
        regex: {
            isRegExp: true
        }
    }
};

const jsonSchema = {
    $id: "websocket-command-argument-schema",
    oneOf: [
        {
            type: "object",
            required: ["name", "type", "kind", "properties"],
            additionalProperties: false,
            properties: {
                name: {
                    type: "string"
                },
                type: typeSchema,
                kind: {
                    type: "string",
                    const: CommandReaderKinds.group
                },
                properties: {
                    type: "object",
                    additionalProperties: {
                        $ref: "websocket-command-argument-schema"
                    }
                },
                valid: validSchema,
                defaultValue: true,
                additionalProperties: {
                    type: "boolean"
                }
            }
        },
        {
            type: "object",
            required: ["name", "type"],
            additionalProperties: false,
            properties: {
                name: {
                    type: "string"
                },
                type: typeSchema,
                valid: validSchema,
                defaultValue: true,
                items: {
                    $ref: "websocket-command-argument-schema"
                }
            }
        }
    ]
};

const arraySchema = {
    $id: "websocket-command-argument-array-schema",
    type: "array",
    items: {
        $ref: "websocket-command-argument-schema"
    }
};

class WebsocketCommandSchema {
    static jsonSchema = jsonSchema;
    static arraySchema = arraySchema;

    static compile(args) {
        if (!Array.isArray(args)) {
            throw new CommandError("Websocket arguments definition must be an array");
        }

        const normalizedArgs = args.map(arg => this._normalizeArgument(arg));

        if (!this._validateArgs(normalizedArgs)) {
            const err = Util.first(this._validateArgs.errors),
                path = err.instancePath || "unknown";

            throw new CommandError(`Invalid websocket argument schema at ${path}: ${err.message}`);
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

        this._ajv.addSchema(this.jsonSchema);
        this._validateArgs = this._ajv.compile(this.arraySchema);
    }

    static _normalizeArgument(rawArg) {
        const arg = {
            ...ObjectUtil.guaranteeObject(rawArg)
        };

        arg.type = this._normalizeType(arg.type ?? CommandTypeNames.string);

        this._normalizeRequired(arg);
        this._normalizeGroup(arg);
        this._normalizeItems(arg);
        this._normalizeProperties(arg);

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

    static _normalizeRequired(arg) {
        if (!Object.hasOwn(arg, "required")) {
            return;
        }

        const required = arg.required;
        delete arg.required;

        arg.valid = {
            ...ObjectUtil.guaranteeObject(arg.valid)
        };

        if (Object.hasOwn(arg.valid, "required") && arg.valid.required !== required) {
            throw new CommandError(`Argument "${arg.name}" has conflicting required declarations`);
        }

        arg.valid.required ??= required;
    }

    static _normalizeGroup(arg) {
        if (!Object.hasOwn(arg, "properties")) {
            return;
        }

        if (Object.hasOwn(arg, "kind") && arg.kind !== CommandReaderKinds.group) {
            throw new CommandError(
                `Argument "${arg.name}" must declare kind "${CommandReaderKinds.group}" when using properties`
            );
        }

        arg.kind = CommandReaderKinds.group;
    }

    static _normalizeItems(arg) {
        if (!Object.hasOwn(arg, "items")) {
            return;
        }

        arg.items = this._normalizeArgument({
            ...ObjectUtil.guaranteeObject(arg.items),
            name: arg.items?.name ?? arg.name
        });
    }

    static _normalizeProperties(arg) {
        if (arg.kind !== CommandReaderKinds.group) {
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

    static _validateEnumTypes(args) {
        for (const arg of args) {
            this._validateEnumType(arg);

            if (arg.kind === CommandReaderKinds.group) {
                this._validateEnumTypes(Object.values(arg.properties ?? {}));
            }

            if (arg.type === CommandTypeNames.array && arg.items) {
                this._validateEnumType(arg.items);
            }
        }
    }

    static _validateEnumType(arg) {
        const type = arg.type;

        if (typeof type !== "object" || type === null || type.name !== CommandTypeNames.enum) {
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

export default WebsocketCommandSchema;
