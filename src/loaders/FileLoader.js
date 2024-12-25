import path from "node:path";

import Loader from "./Loader.js";

class FileLoader extends Loader {
    constructor(name, filePath, logger, options = {}) {
        super(name, logger, {
            type: "file",
            ...options
        });

        if (typeof filePath === "string") {
            this.path = path.resolve(projRoot, filePath);
        } else {
            this.path = filePath;
        }
    }

    checkPath() {
        switch (typeof this.path) {
            case "string":
                break;
            case "undefined":
                return this.failure("No file path provided.");
            default:
                return this.failure("Invalid file path.");
        }
    }

    load() {
        return this.failure("Not implemeted: base class");
    }

    write() {
        return this.failure("Not implemeted: base class");
    }
}

export default FileLoader;
