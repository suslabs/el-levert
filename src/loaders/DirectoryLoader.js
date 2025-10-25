import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import Loader from "./Loader.js";
import FileLoader from "./FileLoader.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";

import LoadStatus from "./LoadStatus.js";

class DirectoryLoader extends Loader {
    static listFilesRecursiveSync(dirPath, maxDepth = Infinity, callback) {
        const files = [],
            stack = [{ path: dirPath, depth: 1 }];

        while (stack.length) {
            const { path: currentDir, depth } = stack.pop(),
                items = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const item of items) {
                const itemPath = path.join(currentDir, item.name);

                if (item.isDirectory() && depth < maxDepth) {
                    stack.push({
                        path: itemPath,
                        depth: depth + 1
                    });
                } else if (!item.isDirectory()) {
                    files.push(itemPath);
                }

                if (typeof callback === "function") {
                    const type = item.isDirectory() ? "directory" : "file";
                    callback(itemPath, type);
                }
            }
        }

        return files;
    }

    static async listFilesRecursiveAsync(dirPath, maxDepth = Infinity, callback) {
        const files = [],
            stack = [{ path: dirPath, depth: 1 }];

        while (stack.length) {
            const { path: currentDir, depth } = stack.pop(),
                items = await fsPromises.readdir(currentDir, { withFileTypes: true });

            for (const item of items) {
                const itemPath = path.join(currentDir, item.name);

                if (item.isDirectory() && depth < maxDepth) {
                    stack.push({
                        path: itemPath,
                        depth: depth + 1
                    });
                } else if (!item.isDirectory()) {
                    files.push(itemPath);
                }

                if (typeof callback === "function") {
                    const type = item.isDirectory() ? "directory" : "file";
                    await callback(itemPath, type);
                }
            }
        }

        return files;
    }

    constructor(name, dirPath, logger, options = {}) {
        super(name, logger, {
            type: "directory",
            ...options
        });

        this.dirPath = dirPath;
        this._logName = this.name || "file";

        this.maxDepth = options.maxDepth ?? Infinity;
        this.excludeDirs = (options.excludeDirs ?? []).map(dir => path.resolve(projRoot, dir));
        this.fileExtension = options.fileExtension ?? "any";

        this.fileLoaderClass = options.fileLoaderClass ?? FileLoader;
        this.sync = options.sync ?? false;
    }

    set dirPath(val) {
        this._dirPath = typeof val === "string" ? path.resolve(projRoot, val) : val;
    }

    get dirPath() {
        return this._dirPath;
    }

    load(options = {}) {
        let ok = 0,
            bad = 0;

        const handleResult = (res, file, loader) => {
            const [data, status] = res;

            switch (status) {
                case LoadStatus.successful:
                    this.loaders.set(file, loader);
                    this.data.set(file, data);

                    ok++;
                    break;
                case LoadStatus.failed:
                    bad++;
                    break;
            }
        };

        const handleError = (err, file) => {
            this.failure(err, `Error occurred while loading ${this._logName}: ${file}`);
            bad++;
        };

        const processFile = file => {
            const loadArgs = this._getLoadArgs(file, options),
                loader = new this.fileLoaderClass(...loadArgs);

            if (this.sync) {
                try {
                    const res = loader.load();
                    handleResult(res, file, loader);
                } catch (err) {
                    handleError(err, file);
                }
            } else {
                return loader
                    .load()
                    .then(res => handleResult(res, file, loader))
                    .catch(err => handleError(err, file));
            }
        };

        const doLoad = () => {
            this.deleteAllData();

            if (this.sync) {
                for (const file of this.files) {
                    processFile(file);
                }
            } else {
                return this.files.reduce((promise, file) => promise.then(_ => processFile(file)), Promise.resolve());
            }
        };

        const finalize = this._finalizeResult.bind(this, "load", "loaded");

        let res = this._checkPath();

        if (this.sync) {
            if (res === LoadStatus.failed) {
                return res;
            }

            res = this._loadFilePaths();
            if (res === LoadStatus.failed) {
                return res;
            }

            doLoad();
            return finalize(ok, bad);
        } else {
            return res.then(status => {
                if (status === LoadStatus.failed) {
                    return status;
                }

                res = this._loadFilePaths();
                return res.then(status => {
                    if (status === LoadStatus.failed) {
                        return status;
                    }

                    return doLoad().then(_ => finalize(ok, bad));
                });
            });
        }
    }

    write(data) {
        if (!this.loaded) {
            const failure = this.failure("The directory needs to be loaded before files can be written");
            return this.sync ? failure : Promise.resolve(failure);
        }

        let ok = 0,
            bad = 0;

        const handleResult = status => {
            switch (status) {
                case LoadStatus.successful:
                    ok++;
                    break;
                case LoadStatus.failed:
                    bad++;
                    break;
            }
        };

        const handleError = (err, filename) => {
            this.failure(err, `Error occurred while writing ${this._logName}: ${filename}`);
            bad++;
        };

        const processFile = filename => {
            const loader = this.loaders.get(filename),
                fileData = data[filename];

            if (typeof loader === "undefined") {
                this.logger?.warn(`Can't write ${filename}: ${this._logName} isn't loaded.`);
                return;
            }

            if (this.sync) {
                try {
                    handleResult(loader.write(fileData));
                } catch (err) {
                    handleError(err, filename);
                }
            } else {
                return loader
                    .write(fileData)
                    .then(handleResult)
                    .catch(err => handleError(err, filename));
            }
        };

        const doWrite = () => {
            const filenames = Object.keys(data);

            if (this.sync) {
                for (const filename of filenames) {
                    processFile(filename);
                }
            } else {
                return filenames.reduce(
                    (promise, filename) => promise.then(_ => processFile(filename)),
                    Promise.resolve()
                );
            }
        };

        const finalize = this._finalizeResult.bind(this, "write", "wrote");

        const res = this._checkPath();

        if (this.sync) {
            if (res === LoadStatus.failed) {
                return res;
            }

            doWrite();
            return finalize(ok, bad);
        } else {
            return res.then(status => {
                if (status === LoadStatus.failed) {
                    return status;
                }

                return doWrite().then(_ => finalize(ok, bad));
            });
        }
    }

    getLoader(data, errorIfNotFound = false) {
        let dataLoader = null;

        for (const loader of this.loaders.values()) {
            if (loader.getData(false) === data) {
                dataLoader = loader;
                break;
            }
        }

        if (errorIfNotFound && dataLoader === null) {
            return this.failure("Data loader not found");
        }

        return dataLoader;
    }

    getPath(data, errorIfNotFound = false) {
        if (!(this.data instanceof Map)) {
            const loader = this.getLoader(data, errorIfNotFound);
            return loader?.path;
        }

        let dataPath = null;

        for (const [path, value] of this.data) {
            if (value === data) {
                dataPath = path;
                break;
            }
        }

        if (errorIfNotFound && dataPath === null) {
            return this.failure("Data path not found");
        }

        return dataPath;
    }

    deleteData(data, errorIfNotFound = false) {
        const path = this.getPath(data, errorIfNotFound);

        if (typeof path === "undefined") {
            return false;
        }

        const loaderDeleted = this.loaders.delete(path);

        if (errorIfNotFound && !loaderDeleted) {
            return this.failure("Couldn't delete data: loader not found");
        }

        let dataDeleted = false;

        if (this.data instanceof Map) {
            dataDeleted = this.data.delete(path);
        } else if (Array.isArray(this.data)) {
            [dataDeleted] = ArrayUtil.removeItem(this.data, data);
        }

        if (errorIfNotFound && !dataDeleted) {
            return this.failure("Couldn't delete data: data not found");
        }

        return errorIfNotFound ? LoadStatus.successful : dataDeleted;
    }

    deleteAllData() {
        if (this.loaders instanceof Map) {
            this.loaders.clear();
        } else {
            this.loaders = new Map();
        }

        if (this.data instanceof Map) {
            this.data.clear();
        } else {
            this.data = new Map();
        }
    }

    _pathError() {
        switch (typeof this._dirPath) {
            case "string":
                return null;
            case "undefined":
                return this.failure("No directory path provided");
            default:
                return this.failure("Invalid directory path provided");
        }
    }

    _checkPath() {
        const err = this._pathError(),
            status = err === null ? LoadStatus.successful : err;

        return this.sync ? status : Promise.resolve(status);
    }

    _loadFilePaths() {
        this.logger?.debug(`Reading ${this.getName()}...`);

        if (!Util.nonemptyString(this._dirPath)) {
            const failure = this.failure(`Invalid ${this.getName()}`);
            return this.sync ? failure : Promise.resolve(failure);
        }

        if (this.sync) {
            try {
                const files = DirectoryLoader.listFilesRecursiveSync(this._dirPath, this.maxDepth);
                return this._handleListSuccess(files);
            } catch (err) {
                return this._handleListError(err);
            }
        } else {
            return DirectoryLoader.listFilesRecursiveAsync(this._dirPath, this.maxDepth)
                .then(files => this._handleListSuccess(files))
                .catch(err => this._handleListError(err));
        }
    }

    _handleListError(err) {
        if (err.code === "ENOENT") {
            return this.failure(`Couldn't find the ${this.getName()}`);
        } else {
            return this.failure(err, `Error occured while reading ${this.getName()}:`);
        }
    }

    _handleListSuccess(files) {
        let filtered = files.filter(file => !Util.hasPrefix(this.excludeDirs, file));

        if (this.fileExtension !== "any") {
            filtered = filtered.filter(file => path.extname(file) === this.fileExtension);
        }

        this.files = filtered;

        this.logger?.debug(`Read ${this.getName()}.`);
        return LoadStatus.successful;
    }

    _getLoadArgs(path, options) {
        const throwOnFailure = options.throwOnFailure ?? this.throwOnFailure;

        const loadArgs = [path, this.logger];

        if (typeof options.loaderName !== "undefined") {
            loadArgs.unshift(options.loaderName);
            delete options.loaderName;
        }

        loadArgs.push({
            ...options,

            throwOnFailure,
            sync: this.sync,

            parent: this
        });

        return loadArgs;
    }

    _finalizeResult(name1, name2, ok, bad) {
        const total = ok + bad;

        if (total === 0) {
            return this.failure(`Couldn't ${name1} any ${this._logName}s.`);
        } else {
            this.logger?.info(
                `${Util.capitalize(name2)} ${total} ${this._logName}(s). ${ok} successful, ${bad} failed.`
            );
        }

        this.result = { ok, bad, total };
        return LoadStatus.successful;
    }
}

export default DirectoryLoader;
