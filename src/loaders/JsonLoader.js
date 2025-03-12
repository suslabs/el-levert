import path from "node:path";
import Ajv from "ajv";

import TextFileLoader from "./TextFileLoader.js";
import LoadStatus from "./LoadStatus.js";
import WriteMode from "./WriteMode.js";

import Util from "../util/Util.js";

class JsonLoader extends TextFileLoader {
    static ajvOptions = {
        allowUnionTypes: true
    };

    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, options);

        this.validateWithSchema = options.validateWithSchema ?? false;
        this.forceSchemaValidation = options.forceSchemaValidation ?? true;

        this.schema = options.schema;
        this._schemaPath = this._getSchemaPath(options);

        this.customStringify = options.stringify;
        this.replacer = options.replacer;
        this.space = options.space ?? 0;

        this._childValidate = this.validate;
        this.validate = this._validate;
    }

    async load() {
        let status;

        status = await this._read();

        if (status === LoadStatus.failed) {
            return status;
        }

        status = this._parse();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (this.validateWithSchema) {
            await this._loadSchema();
        }

        status = this.validate(this.data);

        if (status === LoadStatus.failed) {
            return status;
        } else {
            this.logger?.debug(`Validated ${this.getName()}.`);
        }

        return status;
    }

    async write(data, options = {}, mode = WriteMode.replace) {
        switch (mode) {
            case WriteMode.append:
                return await this.append(data, options);
        }

        let status = this.validate(data);

        if (status === LoadStatus.failed) {
            return status;
        }

        const jsonData = this.stringifyData(data, options);
        return await super.write(jsonData);
    }

    async append(data, options = {}) {
        let status = await this.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const newData = { ...this.data, ...data };
        return await this.write(newData);
    }

    stringifyData(data, options) {
        const stringify = options.stringify ?? this.customStringify,
            replacer = options.replacer ?? this.replacer,
            space = options.space ?? this.space;

        let jsonData;

        if (typeof stringify === "function") {
            jsonData = stringify(data, options);
        } else {
            jsonData = JSON.stringify(data, replacer, space);
        }

        return jsonData;
    }

    static _ajv = new Ajv(JsonLoader.ajvOptions);

    static _formatValidationErrors(errors) {
        let errMessage = [];

        for (const err of errors) {
            const split = err.instancePath.split("/"),
                newPath = split.slice(1).join(".");

            if (!Util.empty(newPath)) {
                errMessage.push(`Property ${newPath} ${err.message}`);
            } else {
                errMessage.push(Util.capitalize(err.message));
            }
        }

        return errMessage.join("\n");
    }

    async _read() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this._jsonString = this.data;
        this.data = {};

        return LoadStatus.successful;
    }

    _parse() {
        let obj;

        try {
            obj = JSON.parse(this._jsonString);
        } catch (err) {
            return this.failure(`Error occured while parsing ${this.getName()}: ${err.message}`);
        }

        this.data = obj;

        return LoadStatus.successful;
    }

    _getSchemaPath(options) {
        if (typeof options.schemaPath === "string") {
            return options.schemaPath;
        }

        if (typeof this.path !== "string" || typeof options.schemaDir !== "string") {
            return;
        }

        const parsed = path.parse(this.path),
            schemaPath = path.join(options.schemaDir, parsed.name + ".schema.json");

        return schemaPath;
    }

    async _loadSchemaFile() {
        const schemaOptions = { throwOnFailure: this.throwOnFailure },
            schemaLoader = new TextFileLoader("schema", this._schemaPath, this.logger, schemaOptions);

        const [schemaString, status] = await schemaLoader.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const schema = JSON.parse(schemaString);
        this.schema = schema;

        return LoadStatus.successful;
    }

    async _loadSchema() {
        if (typeof this._schemaPath === "string") {
            this._schemaLoadStatus = await this._loadSchemaFile();
        } else if (typeof this.schema === "undefined") {
            this._schemaLoadStatus = this.failure("No schema provided.");
        } else {
            this._schemaLoadStatus = LoadStatus.successful;
        }
    }

    _initValidator() {
        if (typeof this.schema === "undefined") {
            return this.failure("Can't initialize validator, no schema provided.");
        }

        if (typeof this._ajvValidate !== "undefined") {
            delete this._ajvValidate;
        }

        const existingValidator = JsonLoader._ajv.getSchema(this.schema.$id);

        if (typeof existingValidator !== "undefined") {
            this._ajvValidate = existingValidator;
        } else {
            this._ajvValidate = JsonLoader._ajv.compile(this.schema);
        }

        return LoadStatus.successful;
    }

    _removeValidator() {
        JsonLoader._ajv.removeSchema(this.schema.$id);
    }

    _schemaValidate(data) {
        if (this._schemaLoadStatus === LoadStatus.failed || this._initValidator() === LoadStatus.failed) {
            if (this.forceSchemaValidation) {
                return [false, undefined];
            } else {
                this.logger?.warn("Schema validation skipped.");
                return [true, undefined];
            }
        }

        const valid = this._ajvValidate(data),
            errors = this._ajvValidate.errors;

        if (valid) {
            return [valid, undefined];
        } else {
            return [valid, errors];
        }
    }

    _validate(data) {
        let valid, error;

        if (typeof this._childValidate === "function") {
            const res = this._childValidate(data);

            if (Array.isArray(res)) {
                [valid, error] = res;
            } else {
                valid = res;
            }

            if (!valid) {
                return this.failure("Validation failed." + (error ? `\n${error}` : ""));
            }
        }

        if (this.validateWithSchema) {
            [valid, error] = this._schemaValidate(data);

            if (!valid) {
                let errMessage = "Validation failed";

                if (typeof error !== "undefined") {
                    errMessage += ":\n" + JsonLoader._formatValidationErrors(error);
                } else {
                    errMessage += ".";
                }

                return this.failure(errMessage);
            }
        }

        return LoadStatus.successful;
    }
}

export default JsonLoader;
