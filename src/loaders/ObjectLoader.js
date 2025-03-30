import FileLoader from "./FileLoader.js";

import Util from "../util/Util.js";

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
        super.load();

        const object = await Util.import(this._path, this.cache);

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
