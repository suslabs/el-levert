import fs from "node:fs/promises";
import path from "node:path";

import FileLoader from "./FileLoader.js";

import LoadStatus from "./LoadStatus.js";
import WriteMode from "./WriteMode.js";

class TextFileLoader extends FileLoader {
    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, {
            type: "text_file",
            ...options
        });

        this.encoding = options.encoding ?? "utf-8";
    }

    set path(val) {
        super.path = val;
        this._tempPath = TextFileLoader._getTempPath(val);
    }

    async load() {
        super.load();

        let text;

        try {
            text = await fs.readFile(this._path, this._fsConfig);
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure(`${this.getName(true)} not found at path: ${this._path}`);
            }

            return this.failure(err, `Error occured while loading ${this.getName()}:`);
        }

        this.data = text.trim();
        return LoadStatus.successful;
    }

    async write(data, mode = WriteMode.replace) {
        switch (mode) {
            case WriteMode.append:
                return await this.append(data);
        }

        super.write();

        try {
            await fs.writeFile(this._tempPath, data, this._fsConfig);
        } catch (err) {
            await this._deleteTemp();
            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        }

        try {
            await fs.rename(this._tempPath, this._path);
        } catch (err) {
            await this._deleteTemp();
            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        }

        return LoadStatus.successful;
    }

    async append(data) {
        const status = await this.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const newData = this.data + data;
        return await this.write(newData);
    }

    getLoadingMessage() {
        return `Loading ${this.getName()}: ${this._path}`;
    }

    getWritingMessage() {
        return `Writing ${this.getName()}: ${this._path}`;
    }

    static _getTempPath(filePath) {
        if (typeof filePath !== "string") {
            return null;
        }

        const parsed = path.parse(filePath),
            tempPath = path.resolve(projRoot, parsed.dir, `${parsed.name}.tmp`);

        return tempPath;
    }

    get _fsConfig() {
        return {
            encoding: this.encoding
        };
    }

    async _deleteTemp() {
        try {
            await fs.unlink(this._tempPath);
        } catch (err) {
            if (err.code === "ENOENT") {
                this.logger?.error(`Temp file for ${this.getName()} not found.`);
            } else {
                this.logger?.error(`Error occured while deleting temp file for ${this.getName()}:`, err);
            }

            return LoadStatus.failed;
        }

        return LoadStatus.successful;
    }
}

export default TextFileLoader;
