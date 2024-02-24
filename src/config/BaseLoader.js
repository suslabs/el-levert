import path from "path";
import fs from "fs/promises";

import configPaths from "./configPaths.json" assert { type: "json" };

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

    async load() {
        let config;
        this.logger?.info(`Reading ${this.name} file...`);

        try {
            config = await fs.readFile(this.path, { encoding: configPaths.encoding });
        } catch (err) {
            if (this.useLogger) {
                this.logger?.error(`Error occured while reading ${this.name} file:`, err);
                return [undefined, LoadStatus.failed];
            }

            throw err;
        }

        try {
            config = JSON.parse(config);
        } catch (err) {
            if (this.useLogger) {
                this.logger?.error(`Error occured while parsing ${this.name} file:`, err);
                return [undefined, LoadStatus.failed];
            }

            throw err;
        }

        this.logger?.info(`Loaded ${this.name} file successfully`);

        return [config, LoadStatus.successful];
    }
}

export default BaseLoader;
