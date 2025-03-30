import path from "node:path";

import Loader from "./Loader.js";

class FileLoader extends Loader {
    constructor(name, filePath, logger, options = {}) {
        super(name, logger, {
            type: "file",
            ...options
        });

        this.path = filePath;
    }

    set path(val) {
        if (typeof val === "string") {
            this._path = path.resolve(projRoot, val);
        } else {
            this._path = val;
        }
    }

    get path() {
        return this._path;
    }

    load() {
        const err = this._checkPath();

        if (err !== null) {
            return err;
        }
    }

    write() {
        const err = this._checkPath();

        if (err !== null) {
            return err;
        }
    }

    _checkPath() {
        switch (typeof this._path) {
            case "string":
                return null;
            case "undefined":
                return this.failure("No file path provided");
            default:
                return this.failure("Invalid file path");
        }
    }
}

export default FileLoader;
