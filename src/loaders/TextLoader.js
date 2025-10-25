import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import FileLoader from "./FileLoader.js";

import LoadStatus from "./LoadStatus.js";
import WriteModes from "./WriteModes.js";

import Util from "../util/Util.js";

class TextLoader extends FileLoader {
    constructor(name, filePath, logger, options = {}) {
        super(name, filePath, logger, {
            type: "text_file",
            ...options
        });

        this.encoding = options.encoding ?? "utf8";
    }

    set path(val) {
        super.path = val;
        this._tempPath = TextLoader._getTempPath(val);
    }

    load() {
        const res = super.load();

        if (this.sync) {
            if (res === LoadStatus.failed) {
                return res;
            }

            try {
                const data = fs.readFileSync(this._path, this._fsConfig);
                return this._handleLoadSuccess(data);
            } catch (err) {
                return this._handleLoadError(err);
            }
        } else {
            return res.then(status => {
                if (status === LoadStatus.failed) {
                    return status;
                }

                return fsPromises
                    .readFile(this._path, this._fsConfig)
                    .then(data => this._handleLoadSuccess(data))
                    .catch(err => this._handleLoadError(err));
            });
        }
    }

    write(data, mode = WriteModes.replace) {
        if (mode === WriteModes.append) {
            return this.append(data);
        }

        const res = super.write();

        if (this.sync) {
            if (res === LoadStatus.failed) {
                return res;
            }

            try {
                fs.writeFileSync(this._tempPath, data, this._fsConfig);
                fs.renameSync(this._tempPath, this._path);

                return LoadStatus.successful;
            } catch (err) {
                return this._handleWriteError(err);
            }
        } else {
            return res.then(status => {
                if (status === LoadStatus.failed) {
                    return status;
                }

                return fsPromises
                    .writeFile(this._tempPath, data, this._fsConfig)
                    .then(_ => fsPromises.rename(this._tempPath, this._path))
                    .then(_ => LoadStatus.successful)
                    .catch(err => this._handleWriteError(err));
            });
        }
    }

    append(data, ...etc) {
        const res = this.load();

        if (this.sync) {
            if (res === LoadStatus.failed) {
                return res;
            }

            return this._handleAppend(data, etc);
        } else {
            return res.then(status => {
                if (status === LoadStatus.failed) {
                    return status;
                }

                return this._handleAppend(data, etc);
            });
        }
    }

    getLoadingMessage() {
        return `Loading ${this.getName()}: ${this._path}`;
    }

    getWritingMessage() {
        return `Writing ${this.getName()}: ${this._path}`;
    }

    static _getTempPath(filePath) {
        if (!Util.nonemptyString(filePath)) {
            return null;
        }

        const parsed = path.parse(filePath);
        return path.resolve(projRoot, parsed.dir, `${parsed.name}.tmp`);
    }

    get _fsConfig() {
        return {
            encoding: this.encoding
        };
    }

    _handleLoadSuccess(data) {
        this.data = data.trim();

        return LoadStatus.successful;
    }

    _handleLoadError(err) {
        if (err.code === "ENOENT") {
            return this.failure(`${this.getName(true)} not found at path: ${this._path}`);
        } else {
            return this.failure(err, `Error occured while loading ${this.getName()}:`);
        }
    }

    _handleWriteError(err) {
        const failure = this.failure(err, `Error occured while writing ${this.getName()}:`);

        if (this.sync) {
            this._deleteTempSync();
            return failure;
        } else {
            return this._deleteTempAsync().then(_ => failure);
        }
    }

    _handleAppend(data, etc) {
        const newData = this.data + data;

        return this.write(newData, ...etc);
    }

    _handleDeleteError(err) {
        if (err.code === "ENOENT") {
            this.logger?.error(`Temp file for ${this.getName()} not found.`);
        } else {
            this.logger?.error(`Error occured while deleting temp file for ${this.getName()}:`, err);
        }

        return LoadStatus.failed;
    }

    _deleteTempSync() {
        try {
            fs.unlinkSync(this._tempPath);
            return LoadStatus.successful;
        } catch (err) {
            return this._handleDeleteError(err);
        }
    }

    async _deleteTempAsync() {
        try {
            await fsPromises.unlink(this._tempPath);
            return LoadStatus.successful;
        } catch (err) {
            return this._handleDeleteError(err);
        }
    }
}

export default TextLoader;
