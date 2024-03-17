import fs from "fs/promises";
import path from "path";

import Loader from "./Loader.js";
import LoadStatus from "./LoadStatus.js";

class FileLoader extends Loader {
    constructor(name, filePath, logger, options = {}) {
        super(name, logger, {
            type: "file",
            ...options
        });

        this.path = path.resolve(filePath);
        this.encoding = options.encoding ?? "utf-8";

        this.tempPath = this.getTempPath();
    }

    getTempPath() {
        const parsed = path.parse(this.path),
            tempPath = path.join(parsed.dir, parsed.name + ".tmp");

        return tempPath;
    }

    get fsConfig() {
        return {
            encoding: this.encoding
        };
    }

    async deleteTemp() {
        try {
            await fs.unlink(this.tempPath);
        } catch (err) {
            if (err.code !== "ENOENT") {
                this.logger?.error("Error occured while deleting temp file:", err);
            }
        }
    }

    async load() {
        let text;

        try {
            text = await fs.readFile(this.path, this.fsConfig);
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure(`${this.getName(true)} not found at path: ${this.path}`);
            }

            return this.failure(err, `Error occured while reading ${this.getName()}:`);
        }

        text = text.trim();
        this.data = text;

        return LoadStatus.successful;
    }

    async write(data) {
        data = data ?? this.data;

        try {
            await fs.writeFile(this.tempPath, data, this.fsConfig);
        } catch (err) {
            await this.deleteTemp();

            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        }

        try {
            await fs.rename(this.tempPath, this.path);
        } catch (err) {
            await this.deleteTemp();

            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        }

        return LoadStatus.successful;
    }
}

export default FileLoader;
