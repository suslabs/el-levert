import path from "path";
import fs from "fs/promises";

import LoadStatus from "./LoadStatus.js";

const encoding = "utf-8";

class BaseLoader {
    constructor(name, basePath, logger) {
        this.name = name;

        const filePath = path.resolve(basePath, name + ".json");
        this.path = filePath;

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
            config = await fs.readFile(this.path, { encoding });
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
