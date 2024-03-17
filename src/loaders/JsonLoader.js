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

function validate() {
    let valid, error;

    if (typeof this.childValidate === "function") {
        const res = this.childValidate(this.config);

        if (Array.isArray(res)) {
            [valid, error] = res;
        } else {
            valid = res;
        }

        if (!valid) {
            return this.failure(`Validation failed: Invalid ${this.getName()}.` + error ? `\n${error}` : "");
        }
    }

    if (this.validateWithSchema) {
        [valid, error] = this.schemaValidate();

        if (!valid) {
            return this.failure("Validation failed:\n" + formatValidationErrors(error));
        }
    }

    if (valid) {
        this.logger?.info(`Validated ${this.getName()}.`);
    }
}

class JsonLoader extends FileLoader {
    constructor(name, jsonPath, logger, options = {}) {
        super(name, jsonPath, logger, options);

        this.validateWithSchema = options.validateWithSchema ?? false;
        this.schema = options.schema;
        this.schemaPath = this.getSchemaPath(options);

        this.childValidate = this.validate;
        this.validate = validate.bind(this);
    }

    getSchemaPath(options) {
        if (typeof options.schemaPath !== "undefined") {
            return options.schemaPath;
        }

        if (typeof options.schemaDir === "undefined") {
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
            return this.failure(err, `Error occured while parsing ${this.getName()}:`);
        }

        this.data = obj;

        return LoadStatus.successful;
    }

    async loadSchema() {
        if (typeof this.schemaPath !== "undefined") {
            const schemaOptions = { throwOnFailure: this.throwOnFailure },
                schemaLoader = new FileLoader("schema", this.schemaPath, this.logger, schemaOptions);

            const [schemaString, status] = await schemaLoader.load();

            if (status === LoadStatus.failed) {
                return status;
            }

            this.schema = JSON.parse(schemaString);
        }

        return LoadStatus.successful;
    }

    initValidator() {
        if (typeof this.schema === "undefined") {
            return this.failure("Can't initialize validator, no schema provided.");
        }

        if (typeof this.ajvValidate !== "undefined") {
            delete this.ajvValidate;
        }

        this.ajvValidate = ajv.compile(this.schema);

        return LoadStatus.successful;
    }

    schemaValidate() {
        if (this.schemaLoadStatus === LoadStatus.failed || this.initValidator() === LoadStatus.failed) {
            this.logger?.warn("Schema validation skipped.");
            return [true, undefined];
        }

        const valid = this.ajvValidate(this.data),
            errors = this.ajvValidate.errors;

        return [valid, errors];
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
            this.schemaLoadStatus = await this.loadSchema();
        }

        status = this.validate();
        if (status === LoadStatus.failed) {
            return status;
        }

        return status;
    }
}

export default JsonLoader;
