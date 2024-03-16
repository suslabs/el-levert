import ConfigError from "../errors/ConfigError.js";

import LoadStatus from "./LoadStatus.js";

import Util from "../util/Util.js";
import { isPromise } from "../util/TypeTester.js";

function load(...args) {
    this.logger?.info(`Loading${this.getName()}...`);

    const res = this.childLoad(...args);

    if (isPromise(res)) {
        return this.loadAsync(res);
    } else {
        return this.loadSync(res);
    }
}

async function write(...args) {
    if (typeof this.childWrite !== "function") {
        return LoadStatus.successful;
    }

    this.logger?.info(`Writing${this.getName()}...`);

    const res = this.childWrite(...args);

    if (isPromise(res)) {
        return this.writeAsync(res);
    } else {
        return this.writeSync(res);
    }
}

class Loader {
    constructor(name = "", logger, options = {}) {
        if (typeof this.load !== "function") {
            throw new ConfigError("Child class must have a load function");
        }

        this.name = name;
        this.logger = logger;

        this.type = options.type ?? "";
        this.throwOnFailure = options.throwOnFailure ?? true;

        this.data = null;

        this.childLoad = this.load;
        this.load = load.bind(this);

        this.childWrite = this.write;
        this.write = write.bind(this);
    }

    getName(capitalized = false) {
        let name = "";

        if (this.name.length > 0) {
            name += this.name;
        }

        if (this.type.length > 0) {
            if (name.length > 0) {
                name += " ";
            }

            name += this.type;
        }

        if (name.length < 1) {
            return "";
        }

        if (capitalized) {
            name = Util.capitalize(name);
        }

        return " " + name;
    }

    loadSync(status) {
        if (status === LoadStatus.failed) {
            return [undefined, status];
        }

        this.logger?.info(`Loaded${this.getName()} successfully.`);
        return [this.data, status];
    }

    async loadAsync(promise) {
        const status = await promise;
        return this.loadSync(status);
    }

    writeSync(status) {
        if (status === LoadStatus.successful) {
            this.logger?.info(`Wrote${this.getName()} successfully.`);
        }

        return status ?? LoadStatus.successful;
    }

    async writeAsync(promise) {
        const status = await promise;
        return this.writeSync(status);
    }

    failure(err, loggerMsg, logLevel = "error") {
        if (this.throwOnFailure) {
            if (typeof err === "string") {
                throw new ConfigError(err);
            } else {
                throw err;
            }
        }

        if (typeof loggerMsg !== "undefined") {
            this.logger?.log(logLevel, loggerMsg, err);
        } else {
            this.logger?.log(logLevel, err);
        }

        return LoadStatus.failed;
    }
}

export default Loader;
