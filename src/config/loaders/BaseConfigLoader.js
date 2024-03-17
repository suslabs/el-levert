import path from "path";

import JsonLoader from "../../loaders/JsonLoader.js";
import LoadStatus from "../../loaders/LoadStatus.js";

import configPaths from "../configPaths.json" assert { type: "json" };

function modify() {
    if (typeof this.childModify !== "function") {
        return;
    }

    const modifiedConfig = this.childModify(this.data);

    if (typeof modifiedConfig !== "undefined") {
        this.config = modifiedConfig;
    }
}

class BaseConfigLoader extends JsonLoader {
    constructor(name, logger, options = {}) {
        const configFilename = configPaths[name],
            configPath = path.resolve(configPaths.dir, configFilename);

        super(name, configPath, logger, {
            validateWithSchema: true,
            schemaDir: configPaths.schemaDir,
            ...options
        });

        this.childModify = this.modify;
        this.modify = modify.bind(this);
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.modify();

        return LoadStatus.successful;
    }
}

export default BaseConfigLoader;
