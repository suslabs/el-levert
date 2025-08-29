import path from "node:path";

import JsonLoader from "../JsonLoader.js";

import configPaths from "../../config/configPaths.json" assert { type: "json" };

import LoadStatus from "../LoadStatus.js";

class BaseConfigLoader extends JsonLoader {
    constructor(name, logger, options = {}) {
        const configFilename = configPaths[name],
            configPath = path.join(configPaths.dir, configFilename);

        super(name, configPath, logger, {
            validateWithSchema: true,
            forceSchemaValidation: false,
            schemaDir: configPaths.schemaDir,
            ...options
        });

        this._childModify = this.modify;
        this.modify = this._modify.bind(this);
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.modify();

        return LoadStatus.successful;
    }

    _modify() {
        if (typeof this._childModify === "function") {
            const modifiedConfig = this._childModify(this.data);
            this.config = modifiedConfig ?? this.config;
        }
    }
}

export default BaseConfigLoader;
