import path from "path";
import fs from "fs/promises";
import Ajv from "ajv";

import LoadStatus from "./LoadStatus.js";
import ConfigError from "../../errors/ConfigError.js";

import Util from "../../util/Util.js";

import configPaths from "../configPaths.json" assert { type: "json" };

const ajvOptions = {
    allowUnionTypes: true
};

const ajv = new Ajv(ajvOptions);

function formatErrors(errors) {
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

class BaseLoader {
    constructor(name, logger, options = {}) {
        this.name = name;
        this.setPaths();

        this.logger = logger;

        this.throwOnFailure = options.throwOnFailure ?? true;
        this.validateWithSchema = options.validateWithSchema ?? true;
    }

    setPaths() {
        const configFilename = configPaths[this.name],
            schemaFilename = path.basename(configFilename, path.extname(configFilename)) + ".schema.json";

        const configPath = path.resolve(configPaths.dir, configFilename),
            schemaPath = path.resolve(configPaths.schemaDir, schemaFilename);

        this.path = configPath;
        this.schemaPath = schemaPath;
    }

    async read() {
        let configString;

        try {
            configString = await fs.readFile(this.path, { encoding: configPaths.encoding });
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure(`${Util.capitalize(this.name)} file not found.`);
            }

            return this.failure(err, `Error occured while reading ${this.name} file:`);
        }

        configString = configString.trim();
        this.configString = configString;

        return LoadStatus.successful;
    }

    parse() {
        let config;

        try {
            config = JSON.parse(this.configString);
        } catch (err) {
            return this.failure(err, `Error occured while parsing ${this.name} file:`);
        }

        this.config = config;
        return LoadStatus.successful;
    }

    async loadSchema() {
        let schemaString;

        try {
            schemaString = await fs.readFile(this.schemaPath, { encoding: configPaths.encoding });
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure("Schema file not found.");
            }

            return this.failure(err, `Error occured while reading ${this.name} schema file:`);
        }

        schemaString = schemaString.trim();
        this.schema = JSON.parse(schemaString);
        this.ajvValidate = ajv.compile(this.schema);

        return LoadStatus.successful;
    }

    baseValidate() {
        let status = LoadStatus.successful;

        if (typeof this.validate === "function") {
            const res = this.validate(this.config);

            let valid, error;

            if (Array.isArray(res)) {
                [valid, error] = res;
            } else {
                valid = res;
            }

            if (!valid) {
                return this.failure("Validation failed." + error ? `\n${error}` : "");
            }
        }

        if (!this.validateWithSchema) {
            return status;
        }

        if (this.schemaLoadStatus === LoadStatus.failed) {
            this.logger?.info("Schema validation skipped.");
            return LoadStatus.successful;
        }

        const valid = this.ajvValidate(this.config),
            errors = this.ajvValidate.errors;

        status &= valid;

        if (errors) {
            return this.failure("Validation failed:\n" + formatErrors(errors));
        }

        return status;
    }

    baseModify() {
        if (typeof this.modify !== "function") {
            return;
        }

        const modifiedConfig = this.modify(this.config);

        if (typeof modifiedConfig !== "undefined") {
            this.config = modifiedConfig;
        }
    }

    async load() {
        this.logger?.info(`Loading ${this.name} file...`);
        let status;

        status = await this.read();
        if (status === LoadStatus.failed) {
            return [undefined, status];
        }

        status = this.parse();
        if (status === LoadStatus.failed) {
            return [undefined, status];
        }

        if (this.validateWithSchema) {
            this.schemaLoadStatus = await this.loadSchema();
        }

        status = this.baseValidate();
        if (status === LoadStatus.failed) {
            return [undefined, status];
        }

        this.baseModify();
        this.logger?.info(`Loaded ${this.name} file successfully.`);

        return [this.config, status];
    }

    failure(err, loggerMsg) {
        if (!this.throwOnFailure) {
            if (typeof loggerMsg !== "undefined") {
                this.logger?.error(loggerMsg, err);
            } else {
                this.logger?.error(err);
            }

            return LoadStatus.failed;
        }

        if (typeof err === "string") {
            throw new ConfigError(err);
        } else {
            throw err;
        }
    }
}

export default BaseLoader;
