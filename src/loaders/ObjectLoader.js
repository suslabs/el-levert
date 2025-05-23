import FileLoader from "./FileLoader.js";

import ModuleUtil from "../util/misc/ModuleUtil.js";

import LoadStatus from "./LoadStatus.js";

class ObjectLoader extends FileLoader {
    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, {
            type: "object",
            ...options
        });

        this.cache = options.cache ?? false;
    }

    async load() {
        if (this.sync) {
            return this.failure("ObjectLoader doesn't support sync mode");
        }

        const status = super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const object = await ModuleUtil.import(this._path, this.cache);

        if (typeof object === "undefined") {
            return LoadStatus.failed;
        }

        this.data = object;
        return LoadStatus.successful;
    }

    write() {
        return this.failure("Can't write an object file");
    }

    getLoadingMessage() {
        return `Loading ${this.getName()}: ${this._path}`;
    }

    getWritingMessage() {
        return null;
    }
}

export default ObjectLoader;
