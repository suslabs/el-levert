import path from "path";
import Ajv from "ajv";

import FileLoader from "./FileLoader.js";
import LoadStatus from "./LoadStatus.js";

import Util from "../util/Util.js";

const ajvOptions = {
    allowUnionTypes: true
};

const ajv = new Ajv(ajvOptions);

function formatValidationErrors(errors) {
    let errMessage = [];

    for (const err of errors) {
        const split = err.instancePath.split("/"),
            newPath = split.slice(1).join(".");

        if (newPath.length > 0) {
            errMessage.push(`Property ${newPath} ${err.message}`);
        } else {
            errMessage.push(Util.capitalize(err.message));
        }
    }

    return errMessage.join("\n");
}

function validate(data) {
    let valid, error;

    if (typeof this.childValidate === "function") {
        const res = this.childValidate(data);

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
        [valid, error] = this.schemaValidate(data);

        if (!valid) {
            let errMessage = "Validation failed";

            if (typeof error !== "undefined") {
                errMessage += ":\n" + formatValidationErrors(error);
            } else {
                errMessage += ".";
            }

            return this.failure(errMessage);
        }
    }

    return LoadStatus.successful;
}

class JsonLoader extends FileLoader {
    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, options);

        this.validateWithSchema = options.validateWithSchema ?? false;
        this.forceSchemaValidation = options.forceSchemaValidation ?? true;

        this.schema = options.schema;
        this.schemaPath = this.getSchemaPath(options);

        this.childValidate = this.validate;
        this.validate = validate.bind(this);
    }

    getSchemaPath(options) {
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

    async read() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.jsonString = this.data;
        this.data = {};

        return LoadStatus.successful;
    }

    parse() {
        let obj;

        try {
            obj = JSON.parse(this.jsonString);
        } catch (err) {
            return this.failure(`Error occured while parsing ${this.getName()}: ${err.message}`);
        }

        this.data = obj;

        return LoadStatus.successful;
    }

    async loadSchemaFile() {
        const schemaOptions = { throwOnFailure: this.throwOnFailure },
            schemaLoader = new FileLoader("schema", this.schemaPath, this.logger, schemaOptions);

        const [schemaString, status] = await schemaLoader.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const schema = JSON.parse(schemaString);
        this.schema = schema;

        return LoadStatus.successful;
    }

    async loadSchema() {
        if (typeof this.schemaPath === "string") {
            this.schemaLoadStatus = await this.loadSchemaFile();
        } else if (typeof this.schema === "undefined") {
            this.schemaLoadStatus = this.failure("No schema provided.");
        } else {
            this.schemaLoadStatus = LoadStatus.successful;
        }
    }

    initValidator() {
        if (typeof this.schema === "undefined") {
            return this.failure("Can't initialize validator, no schema provided.");
        }

        if (typeof this.ajvValidate !== "undefined") {
            delete this.ajvValidate;
        }

        const existingValidator = ajv.getSchema(this.schema.$id);

        if (typeof existingValidator !== "undefined") {
            this.ajvValidate = existingValidator;
        } else {
            this.ajvValidate = ajv.compile(this.schema);
        }

        return LoadStatus.successful;
    }

    schemaValidate(data) {
        if (this.schemaLoadStatus === LoadStatus.failed || this.initValidator() === LoadStatus.failed) {
            if (this.forceSchemaValidation) {
                return [false, undefined];
            } else {
                this.logger?.warn("Schema validation skipped.");
                return [true, undefined];
            }
        }

        const valid = this.ajvValidate(data),
            errors = this.ajvValidate.errors;

        if (valid) {
            return [valid, undefined];
        } else {
            return [valid, errors];
        }
    }

    async load() {
        let status;

        status = await this.read();

        if (status === LoadStatus.failed) {
            return status;
        }

        status = this.parse();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (this.validateWithSchema) {
            await this.loadSchema();
        }

        status = this.validate(this.data);

        if (status === LoadStatus.failed) {
            return status;
        } else {
            this.logger?.info(`Validated ${this.getName()}.`);
        }

        return status;
    }

    async write(data, options = {}) {
        const status = this.validate(data);

        if (status === LoadStatus.failed) {
            return status;
        }

        let jsonData;

        const { stringify, space } = options;

        if (typeof stringify === "function") {
            jsonData = stringify(data);
        } else {
            jsonData = JSON.stringify(data, undefined, space);
        }

        return await super.write(jsonData);
    }
}

export default JsonLoader;
