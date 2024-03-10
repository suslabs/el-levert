import path from "path";
import fs from "fs/promises";
import Ajv from "ajv";

import LoadStatus from "./LoadStatus.js";
import ValidationError from "../../errors/ValidationError.js";

import { isArray } from "../../util/TypeTester.js";

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

        errMessage.push(`Property ${newPath} ${err.message}`);
    }

    return errMessage.join("\n");
}

class BaseLoader {
    constructor(name, logger, options = {}) {
        this.name = name;
        this.setPaths();

        this.validateWithSchema = options.validateWithSchema ?? true;

        if (logger === undefined) {
            this.useLogger = false;
        } else {
            this.logger = logger;
            this.useLogger = true;
        }
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
            if (this.useLogger) {
                this.logger.error(`Error occured while reading ${this.name} file:`, err);
                return LoadStatus.failed;
            }

            throw err;
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
            if (this.useLogger) {
                this.logger.error(`Error occured while parsing ${this.name} file:`, err);
                return LoadStatus.failed;
            }

            throw err;
        }

        this.config = config;
        return LoadStatus.successful;
    }

    async loadSchema() {
        let schemaString;

        try {
            schemaString = await fs.readFile(this.schemaPath, { encoding: configPaths.encoding });
        } catch (err) {
            this.logger.error(`Error occured while reading ${this.name} schema file:`, err);
            return LoadStatus.failed;
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

            if (isArray(res)) {
                [valid, error] = res;
            } else {
                valid = res;
            }

            let errMessage = "Validation failed." + error ? `\n${error}` : "";

            if (!valid) {
                if (this.useLogger) {
                    this.logger?.error(errMessage);
                    return LoadStatus.failed;
                } else {
                    throw new ValidationError(errMessage);
                }
            }
        }

        if (!this.validateWithSchema) {
            return status;
        }

        if (this.schemaLoadStatus === LoadStatus.failed) {
            this.logger.info("Schema validation skipped.");
        }

        const valid = this.ajvValidate(this.config),
            errors = this.ajvValidate.errors;

        status &= valid;

        if (errors) {
            let errMessage = formatErrors(errors);
            errMessage = "Validation failed:\n" + errMessage;

            if (this.useLogger) {
                this.logger?.error(errMessage);
                return LoadStatus.failed;
            } else {
                throw new ValidationError(errMessage);
            }
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
}

export default BaseLoader;
