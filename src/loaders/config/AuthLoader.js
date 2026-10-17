import path from "node:path";

import Loader from "../Loader.js";
import JsonLoader from "../JsonLoader.js";
import DotenvLoader from "../DotenvLoader.js";

import configPaths from "../../config/configPaths.json" assert { type: "json" };
import DefaultAuthConfig from "../../config/DefaultAuthConfig.js";

import Util from "../../util/Util.js";
import FileUtil from "../../util/misc/FileUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import { LoadStatus } from "../LoadStatus.js";

function createAuthData(jsonData, envData) {
    jsonData = ObjectUtil.guaranteeObject(jsonData);
    envData = ObjectUtil.guaranteeObject(envData);

    const envKeys = DefaultAuthConfig.envKeys;

    return {
        token: Util.nonemptyString(jsonData.token) ? jsonData.token : envData[envKeys.token],
        owner: Util.nonemptyString(jsonData.owner) ? jsonData.owner : envData[envKeys.owner]
    };
}

class AuthLoader extends Loader {
    static envKeys = DefaultAuthConfig.envKeys;

    constructor(logger, options) {
        options = ObjectUtil.guaranteeObject(options);

        super("auth", logger, {
            type: "config",
            ...options
        });

        this.sync = options.sync ?? false;
        this.processEnv = ObjectUtil.guaranteeObject(options.processEnv ?? process.env);

        this.jsonPath = path.join(configPaths.dir, configPaths.auth);
        this.envPath = path.join(configPaths.dir, configPaths.authEnv);
    }

    async load() {
        const [jsonData, jsonStatus] = await this._loadJson(),
            [envData, envStatus] = await this._loadEnv();

        if (jsonStatus === LoadStatus.failed || envStatus === LoadStatus.failed) {
            return LoadStatus.failed;
        }

        const data = createAuthData(jsonData, envData),
            status = this.validate(data);

        if (status === LoadStatus.failed) {
            return status;
        }

        this.data = data;
        return LoadStatus.successful;
    }

    validate(data) {
        const envKeys = DefaultAuthConfig.envKeys;

        const missing = [];

        if (!Util.nonemptyString(data.token)) {
            missing.push(
                `Missing auth token. Set "token" in ${configPaths.auth} or ${envKeys.token} in ${configPaths.authEnv}.`
            );
        }

        if (!Util.nonemptyString(data.owner)) {
            missing.push(
                `Missing auth owner. Set "owner" in ${configPaths.auth} or ${envKeys.owner} in ${configPaths.authEnv}.`
            );
        }

        if (!Util.empty(missing)) {
            return this.failure(missing.join("\n"));
        }

        return LoadStatus.successful;
    }

    async _loadJson() {
        const jsonPath = FileUtil.resolve(this.jsonPath);

        if (!(await FileUtil.isFile(jsonPath))) {
            return [null, LoadStatus.ignore];
        }

        const loader = new JsonLoader("auth", this.jsonPath, this.logger, {
            sync: this.sync,
            validateWithSchema: true,
            forceSchemaValidation: false,
            schemaDir: configPaths.schemaDir,
            throwOnFailure: false
        });

        return await loader.load();
    }

    async _loadEnv() {
        const envPath = FileUtil.resolve(this.envPath);

        if (!(await FileUtil.isFile(envPath))) {
            return [
                {
                    ...this.processEnv
                },
                LoadStatus.ignore
            ];
        }

        const loader = new DotenvLoader("auth", this.envPath, this.logger, {
            sync: this.sync,
            throwOnFailure: false,
            processEnv: this.processEnv
        });

        return await loader.load();
    }
}

export default AuthLoader;
