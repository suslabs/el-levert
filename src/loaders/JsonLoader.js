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
    if (typeof this.childValidate === "function") {
        const res = this.childValidate(this.config);

        let valid, error;

        if (Array.isArray(res)) {
            [valid, error] = res;
        } else {
            valid = res;
        }

        if (!valid) {
            return this.failure(`Validation failed: Invalid${this.getName()}.` + error ? `\n${error}` : "");
        }
    }

    const status = this.baseValidate();

    if (status === LoadStatus.failed) {
        return status;
    }

    this.logger?.info(`Validated${this.getName()}.`);
}

class JsonLoader extends FileLoader {
    constructor(name, path, logger, options = {}) {
        super(name, path, logger, options);

        this.schemaDir = options.schemaDir;
        this.validateWithSchema = options.validateWithSchema ?? true;

        this.schemaPath = this.getSchemaPath();

        this.childValidate = this.validate;
        this.validate = validate.bind(this);
    }

    getSchemaPath() {
        const parsed = path.parse(this.path),
            schemaDir = this.schemaDir ?? parsed.dir,
            schemaPath = path.join(schemaDir, parsed.name + ".schema.json");

        return schemaPath;
    }

    async loadSchema() {
        const schemaLoader = new FileLoader("schema", this.schemaPath, this.logger),
            [schemaString, status] = await schemaLoader.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.schema = JSON.parse(schemaString);
        this.ajvValidate = ajv.compile(this.schema);

        return LoadStatus.successful;
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
            return this.failure(err, `Error occured while parsing${this.getName()}:`);
        }

        this.data = obj;

        return LoadStatus.successful;
    }

    baseValidate() {
        let status = LoadStatus.successful;

        if (!this.validateWithSchema) {
            return status;
        }

        if (this.schemaLoadStatus === LoadStatus.failed) {
            this.logger?.info("Schema validation skipped.");
            return status;
        }

        const valid = this.ajvValidate(this.data),
            errors = this.ajvValidate.errors;

        status &= valid;

        if (errors) {
            return this.failure("Validation failed:\n" + formatValidationErrors(errors));
        }

        return status;
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
