import FileLoader from "./FileLoader.js";
import LoadStatus from "./LoadStatus.js";

import Util from "../util/Util.js";

class ObjectLoader extends FileLoader {
    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, {
            type: "object",
            ...options
        });

        this.cache = options.cache ?? false;
    }

    async load() {
        const err = this._checkPath();
        if (err) return err;

        const object = await Util.import(this.path, this.cache);

        if (typeof object === "undefined") {
            return LoadStatus.failed;
        }

        this.data = object;
        return LoadStatus.successful;
    }

    write() {
        return this.failure("Can't write an object file.");
    }

    getLoadingMessage() {
        return `Loading ${this.getName()}: ${this.path}`;
    }

    getWritingMessage() {
        return "";
    }
}

export default ObjectLoader;
