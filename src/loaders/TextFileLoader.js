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

        this._tempPath = this._getTempPath();
    }

    async load() {
        const err = this._checkPath();

        if (err) {
            return err;
        }

        let text;

        try {
            text = await fs.readFile(this.path, this._fsConfig);
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

        const err = this._checkPath();

        if (err) {
            return err;
        }

        try {
            await fs.writeFile(this._tempPath, data, this._fsConfig);
        } catch (err) {
            await this._deleteTemp();
            return this.failure(err, `Error occured while writing ${this.getName()}:`);
        }

        try {
            await fs.rename(this._tempPath, this.path);
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
        return `Loading ${this.getName()}: ${this.path}`;
    }

    getWritingMessage() {
        return `Writing ${this.getName()}: ${this.path}`;
    }

    get _fsConfig() {
        return {
            encoding: this.encoding
        };
    }

    _getTempPath() {
        if (typeof this.path !== "string") {
            return;
        }

        const parsed = path.parse(this.path),
            tempPath = path.join(parsed.dir, `${parsed.name}.tmp`);

        return tempPath;
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
