import Ajv from "ajv";

import PropertyWebsocketReader from "./reader/PropertyWebsocketReader.js";
import WebsocketCommandSchema from "./WebsocketCommandSchema.js";

import CommandReaderKinds from "../command/reader/CommandReaderKinds.js";

import CommandTypeClasses from "../command/type/CommandTypeClasses.js";
import CommandTypeNames from "../command/type/CommandTypeNames.js";
import commandArgumentShorthands from "../command/schema/commandArgumentShorthands.js";

import WebsocketCommandArgument from "./structs/WebsocketCommandArgument.js";
import WebsocketCommandParseSession from "./structs/WebsocketCommandParseSession.js";
import WebsocketCommandValidationIssue from "./structs/WebsocketCommandValidationIssue.js";

import CommandError from "../../errors/CommandError.js";

const ajv = new Ajv({
    coerceTypes: true,
    useDefaults: true,
    removeAdditional: "all",
    allowUnionTypes: true,
    allErrors: true
});

class WebsocketCommandParser {
    constructor(argsDef, isResponse = false) {
        this.isResponse = isResponse;
        this.arguments = [];
        this.validateFn = null;

        this._compileArguments(argsDef);
    }

    parse(data, context) {
        const source = typeof data === "object" && data !== null ? data : {},
            session = new WebsocketCommandParseSession(context),
            coercedData = { ...source };

        this._validateData(session, coercedData);
        this._buildResults(session, source, coercedData);

        return session;
    }

    _compileArguments(argsDef) {
        const compiledArgs = WebsocketCommandSchema.compile(this._normalizeArguments(argsDef));

        this.arguments = compiledArgs.map(arg => this._createArgument(arg));
        this.validateFn = ajv.compile(this._createJsonSchema());
    }

    _normalizeArguments(argsDef) {
        if (Array.isArray(argsDef)) {
            return argsDef;
        }

        return Object.entries(argsDef ?? {}).map(([name, value]) => ({
            ...value,
            name
        }));
    }

    _createArgument(arg) {
        const typeName = this._normalizeTypeName(arg.type),
            TypeClass = CommandTypeClasses.get(
                arg.kind === CommandReaderKinds.group ? CommandTypeNames.group : typeName
            );

        if (typeof TypeClass === "undefined") {
            throw new CommandError(`Unsupported websocket type: ${typeName}`);
        }

        return new WebsocketCommandArgument({
            name: arg.name,
            reader: new PropertyWebsocketReader({
                name: arg.name
            }),
            type: new TypeClass(typeof arg.type === "object" ? arg.type : {}),
            valid: arg.valid,
            typeName,
            kind: arg.kind,
            properties: arg.properties,
            items: arg.items,
            defaultValue: arg.defaultValue,
            additionalProperties: arg.additionalProperties
        });
    }

    _createJsonSchema() {
        const properties = {},
            required = [];

        for (const arg of this.arguments) {
            properties[arg.name] = arg.getJsonSchema();

            if (arg.isRequired()) {
                required.push(arg.name);
            }
        }

        return {
            type: "object",
            properties,
            required,
            additionalProperties: false
        };
    }

    _validateData(session, data) {
        if (this.validateFn(data)) {
            return;
        }

        for (const error of this.validateFn.errors) {
            session.addIssue(this._createIssue(error));
        }
    }

    _createIssue(error) {
        const propName = error.instancePath ? error.instancePath.slice(1) : (error.params.missingProperty ?? "unknown");

        let message = `Validation error for field "${propName}": ${error.message}`;

        switch (error.keyword) {
            case "required":
                message = `Missing required ${this.isResponse ? "response field" : "parameter"}: ${propName}`;
                break;
            case "type":
                message = `Invalid type for field "${propName}": ${error.message}`;
                break;
        }

        return new WebsocketCommandValidationIssue(error.keyword, message, {
            instancePath: error.instancePath
        });
    }

    _buildResults(session, rawData, coercedData) {
        for (const arg of this.arguments) {
            session.addResult(arg.createResult(rawData, coercedData, session.issues));
        }
    }

    _normalizeTypeName(type) {
        const name = typeof type === "string" ? type : (type?.name ?? CommandTypeNames.string);

        return commandArgumentShorthands.type.fields[name] ?? name;
    }
}

export default WebsocketCommandParser;
