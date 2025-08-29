import path from "node:path";

import Loader from "./Loader.js";

import LoadStatus from "./LoadStatus.js";

class FileLoader extends Loader {
    constructor(name, filePath, logger, options = {}) {
        super(name, logger, {
            type: "file",
            ...options
        });

        this.path = filePath;
        this.sync = this.options.sync ?? false;
    }

    set path(val) {
        this._path = typeof val === "string" ? path.resolve(projRoot, val) : val;
    }

    get path() {
        return this._path;
    }

    load() {
        return this._checkPath();
    }

    write() {
        return this._checkPath();
    }

    _pathError() {
        switch (typeof this._path) {
            case "string":
                return null;
            case "undefined":
                return this.failure("No file path provided");
            default:
                return this.failure("Invalid file path");
        }
    }

    _checkPath() {
        const err = this._pathError(),
            status = err === null ? LoadStatus.successful : err;

        return this.sync ? status : Promise.resolve(status);
    }
}

export default FileLoader;
