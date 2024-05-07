import LoaderError from "../errors/LoaderError.js";
import LoadStatus from "./LoadStatus.js";

import Util from "../util/Util.js";
import { isPromise } from "../util/TypeTester.js";

function _load(...args) {
    let loadingMessage;

    if (typeof this.getLoadingMessage === "function") {
        loadingMessage = this.getLoadingMessage();
    } else {
        loadingMessage = `Loading ${this.getName()}...`;
    }

    if (loadingMessage.length > 0) {
        this.logger?.debug(loadingMessage);
    }

    this.result = {};
    const res = this.childLoad(...args);

    if (isPromise(res)) {
        return this.loadAsync(res);
    } else {
        return this.loadSync(res);
    }
}

function _write(data, ...args) {
    if (typeof this.childWrite !== "function") {
        return LoadStatus.successful;
    }

    let writingMessage;

    if (typeof this.getWritingMessage === "function") {
        writingMessage = this.getWritingMessage();
    } else {
        writingMessage = `Writing ${this.getName()}...`;
    }

    if (writingMessage.length > 0) {
        this.logger?.debug(writingMessage);
    }

    data ??= this.data;
    if (data === null) {
        return this.failure(`Can't write ${this.getName()}, no data provided.`);
    }

    this.result = {};
    const res = this.childWrite(data, ...args);

    if (isPromise(res)) {
        return this.writeAsync(res, data);
    } else {
        return this.writeSync(res, data);
    }
}

class Loader {
    constructor(name = "", logger, options = {}) {
        if (typeof this.load !== "function") {
            throw new LoaderError("Child class must have a load function");
        }

        this.name = name;
        this.logger = logger;

        this.type = options.type ?? "";
        this.throwOnFailure = options.throwOnFailure ?? true;

        this.data = null;
        this.loaded = false;
        this.result = {};

        this.childLoad = this.load;
        this.load = _load.bind(this);

        this.childWrite = this.write;
        this.write = _write.bind(this);
    }

    getName(capitalized = false) {
        let name = this.name;

        if (this.type.length > 0) {
            if (name.length > 0) {
                name += " ";
            }

            name += this.type;
        }

        if (capitalized) {
            name = Util.capitalize(name);
        }

        return name;
    }

    loadSync(status) {
        if (status === LoadStatus.failed) {
            return [undefined, status];
        }

        let ignored = status === LoadStatus.ignore,
            loadedMessage = "";

        if (!ignored) {
            if (typeof this.getLoadedMessage === "function") {
                loadedMessage = this.getLoadedMessage();
            } else {
                loadedMessage = `Loaded ${this.getName()} successfully.`;
            }
        } else if (typeof this.getIgnoredMessage === "function") {
            loadedMessage = this.getIgnoredMessage();
        }

        if (loadedMessage.length > 0) {
            this.logger?.log(ignored ? "debug" : "info", loadedMessage);
        }

        this.loaded = true;
        return [this.data, status ?? LoadStatus.successful];
    }

    async loadAsync(promise, data) {
        const status = await promise;
        return this.loadSync(status, data);
    }

    writeSync(status, data) {
        if (status === LoadStatus.failed) {
            return status;
        }

        let ignored = status === LoadStatus.ignore,
            writtenMessage = "";

        if (!ignored) {
            if (typeof this.getWrittenMessage === "function") {
                writtenMessage = this.getWrittenMessage();
            } else {
                writtenMessage = `Wrote ${this.getName()} successfully.`;
            }
        } else if (typeof this.getIgnoredMessage === "function") {
            writtenMessage = this.getIgnoredMessage();
        }

        if (writtenMessage.length > 0) {
            this.logger?.log(ignored ? "debug" : "info", loadedMessage);
        }

        this.data = data;
        return status ?? LoadStatus.successful;
    }

    async writeAsync(promise) {
        const status = await promise;
        return this.writeSync(status);
    }

    failure(err, loggerMsg, logLevel = "error") {
        if (this.throwOnFailure) {
            if (typeof err === "string") {
                throw new LoaderError(err);
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
