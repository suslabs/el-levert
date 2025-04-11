import path from "node:path";
import Ajv from "ajv";

import TextLoader from "./TextLoader.js";

import Util from "../util/Util.js";

import LoadStatus from "./LoadStatus.js";
import WriteMode from "./WriteMode.js";

class JsonLoader extends TextLoader {
    static ajvOptions = {
        allowUnionTypes: true
    };

    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, {
            type: "json_file",
            ...options
        });

        this.sync = options.sync ?? false;
        this.validateWithSchema = options.validateWithSchema ?? false;
        this.forceSchemaValidation = options.forceSchemaValidation ?? true;

        this.schema = options.schema;

        this.customStringify = options.stringify;
        this.replacer = options.replacer;
        this.spaces = options.spaces ?? 0;

        this._childValidate = this.validate;
        this.validate = this._validate;
    }

    set path(val) {
        super.path = val;
        this._schemaPath = JsonLoader._getSchemaPath(val, this.options);
    }

    stringifyData(data, options) {
        const stringify = options.stringify ?? this.customStringify,
            replacer = options.replacer ?? this.replacer,
            spaces = options.spaces ?? this.spaces;

        let jsonData;

        if (typeof stringify === "function") {
            jsonData = stringify(data, options);
        } else {
            jsonData = JSON.stringify(data, replacer, spaces);
        }

        return jsonData;
    }

    load() {
        const res = super.load();

        if (this.sync) {
            if (res === LoadStatus.failed) {
                return res;
            }

            return this._loadJson();
        } else {
            return res.then(status => {
                if (status === LoadStatus.failed) {
                    return status;
                }

                return this._loadJson();
            });
        }
    }

    write(data, options = {}, mode = WriteMode.replace) {
        if (mode === WriteMode.append) {
            return this.append(data, options);
        }

        const status = this.validate(data);

        if (status === LoadStatus.failed) {
            return this.sync ? status : Promise.resolve(status);
        }

        return this._writeJson(data, options);
    }

    static _ajv = new Ajv(JsonLoader.ajvOptions);

    static _formatValidationErrors(errors) {
        let errMessage = [];

        for (const err of errors) {
            const split = err.instancePath.split("/"),
                newPath = Util.after(split).join(".");

            if (!Util.empty(newPath)) {
                errMessage.push(`Property ${newPath} ${err.message}`);
            } else {
                errMessage.push(Util.capitalize(err.message));
            }
        }

        return errMessage.join("\n");
    }

    static _getSchemaPath(filePath, options) {
        if (typeof options.schemaPath === "string") {
            return options.schemaPath;
        }

        if (typeof filePath !== "string" || typeof options.schemaDir !== "string") {
            return null;
        }

        const parsed = path.parse(filePath),
            schemaPath = path.resolve(projRoot, options.schemaDir, `${parsed.name}.schema.json`);

        return schemaPath;
    }

    _parse() {
        try {
            this.data = JSON.parse(this._jsonString);
            return LoadStatus.successful;
        } catch (err) {
            return this.failure(err, `Error occured while parsing ${this.getName()}:`);
        }
    }

    _loadJson() {
        this._jsonString = this.data;
        this.data = null;

        const status = this._parse();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (!this.validateWithSchema) {
            return this.validate(this.data);
        }

        const res = this._loadSchema();

        if (this.sync) {
            return this.validate(this.data);
        } else {
            return res.then(_ => this.validate(this.data));
        }
    }

    _handleSchemaLoad(res) {
        const [schemaString, status] = res;

        if (status === LoadStatus.failed) {
            return status;
        }

        this.schema = JSON.parse(schemaString);
        return LoadStatus.successful;
    }

    _loadSchemaFile() {
        const schemaOptions = {
            type: "json_file",

            throwOnFailure: this.throwOnFailure,
            sync: this.sync
        };

        const schemaLoader = new TextLoader("schema", this._schemaPath, this.logger, schemaOptions),
            res = schemaLoader.load();

        if (this.sync) {
            return this._handleSchemaLoad(res);
        } else {
            return res.then(res => this._handleSchemaLoad(res));
        }
    }

    _loadSchema() {
        if (typeof this._schemaPath === "string") {
            const res = this._loadSchemaFile();

            if (this.sync) {
                this._schemaLoadStatus = res;
            } else {
                return res.then(status => (this._schemaLoadStatus = status));
            }
        } else if (typeof this.schema === "undefined") {
            this._schemaLoadStatus = this.failure("No schema provided");
        } else {
            this._schemaLoadStatus = LoadStatus.successful;
        }

        return this.sync ? undefined : Promise.resolve();
    }

    _initValidator() {
        if (typeof this.schema === "undefined") {
            return this.failure("Can't initialize validator, no schema provided");
        }

        if (typeof this._ajvValidate !== "undefined") {
            delete this._ajvValidate;
        }

        const existingValidator = JsonLoader._ajv.getSchema(this.schema.$id);

        if (typeof existingValidator === "undefined") {
            this._ajvValidate = JsonLoader._ajv.compile(this.schema);
        } else {
            this._ajvValidate = existingValidator;
        }

        return LoadStatus.successful;
    }

    _schemaValidate(data) {
        const schemaStatus = this._schemaLoadStatus,
            status = schemaStatus === LoadStatus.failed ? schemaStatus : this._initValidator();

        if (status === LoadStatus.failed) {
            if (this.forceSchemaValidation) {
                return [false, null];
            } else {
                this.logger?.warn("Schema validation skipped");
                return [true, null];
            }
        }

        const valid = this._ajvValidate(data),
            errors = this._ajvValidate.errors;

        return [valid, valid ? null : errors];
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
                const errStr = error ? `\n${error}` : "";
                return this.failure("Validation failed." + errStr);
            }
        }

        if (this.validateWithSchema) {
            [valid, error] = this._schemaValidate(data);

            if (!valid) {
                let errMessage = "Validation failed";

                if (typeof error === "undefined") {
                    errMessage += ".";
                } else {
                    errMessage += ":\n" + JsonLoader._formatValidationErrors(error);
                }

                return this.failure(errMessage);
            }
        }

        return LoadStatus.successful;
    }

    _writeJson(data, options) {
        const jsonData = this.stringifyData(data, options);

        return super.write(jsonData);
    }

    _handleAppend(data, options) {
        const newData = { ...this.data, ...data };

        return this.write(newData, options);
    }
}

export default JsonLoader;
