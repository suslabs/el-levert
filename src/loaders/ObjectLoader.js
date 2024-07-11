import Loader from "./Loader.js";
import LoadStatus from "./LoadStatus.js";

import Util from "../util/Util.js";

class ObjectLoader extends Loader {
    constructor(name, filePath, logger, options = {}) {
        super(name, logger, {
            type: "object",
            ...options
        });

        this.path = filePath;
        this.cache = options.cache ?? false;
    }

    async load() {
        switch (typeof this.path) {
            case "string":
                break;
            case "undefined":
                return this.failure("No file path provided.");
            default:
                return this.failure("Invalid file path.");
        }

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
