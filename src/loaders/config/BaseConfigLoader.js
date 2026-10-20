import path from "node:path";

import JsonLoader from "../JsonLoader.js";

import configPaths from "../../config/configPaths.json" assert { type: "json" };

import { LoadStatus } from "../LoadStatus.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class BaseConfigLoader extends JsonLoader {
    static applyDefaults(data, defaults) {
        if (!TypeTester.isObject(data) || !TypeTester.isObject(defaults)) {
            return data;
        }

        for (const [key, def] of Object.entries(defaults)) {
            if (this._isSection(def)) {
                data[key] = this.applyDefaults(data[key] ?? {}, def);
            } else {
                data[key] = this._applyDescriptor(data[key], def);
            }
        }

        return data;
    }

    constructor(name, logger, options) {
        options = ObjectUtil.guaranteeObject(options);

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

    static _isSection(def) {
        return TypeTester.isObject(def) && Object.values(def).some(TypeTester.isObject);
    }

    static _applyDescriptor(val, def) {
        if (!TypeTester.isObject(def) || Array.isArray(def) || Util.empty(Object.keys(def))) {
            return val ?? (typeof def === "object" && def !== null ? structuredClone(def) : def);
        }

        val = val ?? def.base ?? def.min ?? 0;

        if (def.mult != null) {
            val *= def.mult;
        }

        if (def.round) {
            val = Math.round(val);
        }

        if (def.min != null || def.max != null) {
            val = Util.clamp(val, def.min, def.max);
        }

        return val;
    }

    _modify() {
        if (this.constructor.defaults != null) {
            this.constructor.applyDefaults(this.data, this.constructor.defaults);
        }

        if (typeof this._childModify === "function") {
            const modifiedConfig = this._childModify(this.data);
            this.data = modifiedConfig ?? this.data;
        }
    }
}

export default BaseConfigLoader;
