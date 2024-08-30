import fs from "node:fs/promises";
import path from "node:path";

import Loader from "./Loader.js";
import LoadStatus from "./LoadStatus.js";
import WriteMode from "./WriteMode.js";

class FileLoader extends Loader {
    constructor(name, filePath, logger, options = {}) {
        super(name, logger, {
            type: "file",
            ...options
        });

        if (typeof filePath === "string") {
            this.path = path.resolve(filePath);
        } else {
            this.path = filePath;
        }

        this.tempPath = this.getTempPath();

        this.encoding = options.encoding ?? "utf-8";
    }

    get fsConfig() {
        return {
            encoding: this.encoding
        };
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

    getTempPath() {
        if (typeof this.path !== "string") {
            return;
        }

        const parsed = path.parse(this.path),
            tempPath = path.join(parsed.dir, parsed.name + ".tmp");

        return tempPath;
    }

    async deleteTemp() {
        try {
            await fs.unlink(this.tempPath);
        } catch (err) {
            if (err.code === "ENOENT") {
                this.logger?.error("Temp file not found");
                return;
            }

            this.logger?.error("Error occured while deleting temp file:", err);
        }
    }

    async load() {
        const err = this.checkPath();
        if (err) {
            return err;
        }

        let text;

        try {
            text = await fs.readFile(this.path, this.fsConfig);
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure(`${this.getName(true)} not found at path: ${this.path}`);
            }

            return this.failure(err, `Error occured while loading ${this.getName()}:`);
        }

        text = text.trim();
        this.data = text;

        return LoadStatus.successful;
    }

    async write(data, mode = WriteMode.replace) {
        switch (mode) {
            case WriteMode.append:
                return await this.append(data);
        }

        const err = this.checkPath();
        if (err) {
            return err;
        }

        try {
            await fs.writeFile(this.tempPath, data, this.fsConfig);
        } catch (err) {
            await this.deleteTemp();
            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        }

        try {
            await fs.rename(this.tempPath, this.path);
        } catch (err) {
            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        } finally {
            await this.deleteTemp();
        }

        return LoadStatus.successful;
    }

    async append(data) {
        const err = this.checkPath();
        if (err) {
            return err;
        }

        return LoadStatus.successful;
    }

    getLoadingMessage() {
        return `Loading ${this.getName()}: ${this.path}`;
    }

    getWritingMessage() {
        return `Writing ${this.getName()}: ${this.path}`;
    }
}

export default FileLoader;
