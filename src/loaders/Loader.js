import { isPromise } from "node:util/types";

import Util from "../util/Util.js";

import LoadStatus from "./LoadStatus.js";

import LoaderError from "../errors/LoaderError.js";

class Loader {
    constructor(name, logger, options = {}) {
        if (typeof this.load !== "function") {
            throw new LoaderError("Child class must have a load function");
        }

        this.name = name ?? "";
        this.logger = logger;

        this.options = options;

        this.type = options.type ?? "";
        this.throwOnFailure = options.throwOnFailure ?? true;
        this.dataField = options.dataField ?? "data";
        this.parentLoader = options.parent ?? null;

        this.data = null;
        this.loaded = false;
        this.result = {};

        this._childLoad = this.load;
        this.load = this._load;

        this._childWrite = this.write;
        this.write = this._write;

        this._childDispose = this.dispose;
        this.dispose = this._dispose;
    }

    getName(capitalized = false) {
        let type = this.type.replaceAll("_", " "),
            name = this.name;

        if (!Util.empty(type)) {
            if (!Util.empty(name)) {
                name += " ";
            }

            name += type;
        }

        if (capitalized) {
            name = Util.capitalize(name);
        }

        return name;
    }

    getData() {
        const data = this[this.dataField];

        if (typeof data === "undefined") {
            throw new LoaderError("Data field not found");
        }

        return data;
    }

    failure(err, loggerMsg, logLevel = "error") {
        if (typeof err === "string") {
            let message = err;

            if (message.endsWith(".")) {
                message = message.slice(0, -1);
            }

            err = new LoaderError(message);
        }

        if (this.throwOnFailure) {
            throw err;
        }

        if (typeof loggerMsg === "undefined") {
            this.logger?.log(logLevel, err);
        } else {
            this.logger?.log(logLevel, loggerMsg, err);
        }

        return LoadStatus.failed;
    }

    _loadSync(status) {
        if (status === LoadStatus.failed) {
            return [null, status];
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

        if (!Util.empty(loadedMessage)) {
            this.logger?.log(ignored ? "debug" : "info", loadedMessage);
        }

        this.loaded = true;
        return [this.getData(), status ?? LoadStatus.successful];
    }

    async _loadAsync(promise) {
        const status = await promise;
        return this._loadSync(status);
    }

    _writeSync(status, data) {
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

        if (!Util.empty(writtenMessage)) {
            this.logger?.log(ignored ? "debug" : "info", writtenMessage);
        }

        this.data = data;
        return status ?? LoadStatus.successful;
    }

    async _writeAsync(promise, data) {
        const status = await promise;
        return this._writeSync(status, data);
    }

    _load(...args) {
        let loadingMessage;

        if (typeof this.getLoadingMessage === "function") {
            loadingMessage = this.getLoadingMessage();
        } else {
            loadingMessage = `Loading ${this.getName()}...`;
        }

        if (!Util.empty(loadingMessage)) {
            this.logger?.debug(loadingMessage);
        }

        this.result = {};
        const res = this._childLoad(...args);

        if (isPromise(res)) {
            return this._loadAsync(res);
        } else {
            return this._loadSync(res);
        }
    }

    _write(data, ...args) {
        if (typeof this._childWrite !== "function") {
            return LoadStatus.successful;
        }

        let writingMessage;

        if (typeof this.getWritingMessage === "function") {
            writingMessage = this.getWritingMessage();
        } else {
            writingMessage = `Writing ${this.getName()}...`;
        }

        if (!Util.empty(writingMessage)) {
            this.logger?.debug(writingMessage);
        }

        data ??= this.data;
        if (data === null) {
            return this.failure(`Can't write ${this.getName()}, no data provided.`);
        }

        this.result = {};
        const res = this._childWrite(data, ...args);

        if (isPromise(res)) {
            return this._writeAsync(res, data);
        } else {
            return this._writeSync(res, data);
        }
    }

    _dispose() {
        if (typeof this._childDispose !== "function") {
            return;
        }

        return this._childDispose();
    }
}

export default Loader;
