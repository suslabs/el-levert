import path from "path";
import fs from "fs/promises";

import configPaths from "../../configPaths.json" assert { type: "json" };

import LoadStatus from "./LoadStatus.js";

class BaseLoader {
    constructor(name, logger) {
        this.name = name;

        const configPath = path.resolve(configPaths.dir, configPaths[name]);
        this.path = configPath;

        if (logger === undefined) {
            this.useLogger = false;
        } else {
            this.logger = logger;
            this.useLogger = true;
        }
    }

    async read() {
        let configString;
        this.logger?.info(`Reading ${this.name} file...`);

        try {
            configString = await fs.readFile(this.path, { encoding: configPaths.encoding });
        } catch (err) {
            if (this.useLogger) {
                this.logger?.error(`Error occured while reading ${this.name} file:`, err);
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
                this.logger?.error(`Error occured while parsing ${this.name} file:`, err);
                return LoadStatus.failed;
            }

            throw err;
        }

        this.config = config;
        return LoadStatus.successful;
    }

    baseValidate() {
        return LoadStatus.successful;
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
        let status;

        status = await this.read();
        if (status === LoadStatus.failed) {
            return [undefined, status];
        }

        status = this.parse();
        if (status === LoadStatus.failed) {
            return [undefined, status];
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
