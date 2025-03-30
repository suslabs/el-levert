import fs from "node:fs/promises";
import path from "node:path";

import Loader from "./Loader.js";
import FileLoader from "./FileLoader.js";

import Util from "../util/Util.js";

import LoadStatus from "./LoadStatus.js";

class DirectoryLoader extends Loader {
    static async listFilesRecursive(dirPath, maxDepth = Infinity, callback) {
        const files = [],
            stack = [{ path: dirPath, depth: 1 }];

        while (stack.length) {
            const { path: currentDir, depth } = stack.pop(),
                items = await fs.readdir(currentDir);

            for (const item of items) {
                const itemPath = path.join(currentDir, item),
                    stat = await fs.stat(itemPath);

                if (stat.isDirectory() && depth < maxDepth) {
                    stack.push({
                        path: itemPath,
                        depth: depth + 1
                    });
                } else if (!stat.isDirectory()) {
                    files.push(itemPath);
                }

                if (typeof callback === "function") {
                    const type = stat.isDirectory() ? "directory" : "file";
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
        this._logName = this.name ?? "file";

        this.maxDepth = options.maxDepth ?? Infinity;
        this.excludeDirs = (options.excludeDirs ?? []).map(dir => path.resolve(projRoot, dir));
        this.fileExtension = options.fileExtension ?? "any";

        this.fileLoaderClass = options.fileLoaderClass ?? FileLoader;
    }

    set dirPath(val) {
        if (typeof val === "string") {
            this._dirPath = path.resolve(projRoot, val);
        } else {
            this._dirPath = val;
        }
    }

    get dirPath() {
        return this._dirPath;
    }

    async load(options = {}) {
        const err = this._checkPath();

        if (err !== null) {
            return err;
        }

        let status = await this._loadFilePaths();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (Util.empty(this.files)) {
            return this.failure(`Couldn't find any ${this._logName}s.`);
        }

        this.deleteAllData();

        let ok = 0,
            bad = 0;

        for (const file of this.files) {
            const loadArgs = this._getLoadArgs(file, options),
                loader = new this.fileLoaderClass(...loadArgs);

            let data;

            try {
                [data, status] = await loader.load();
            } catch (err) {
                this.failure(err, `Error occured while loading ${this._logName}: ` + file);

                bad++;
                continue;
            }

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
        }

        const total = ok + bad;

        if (total === 0) {
            return this.failure(`Couldn't load any ${this._logName}s.`);
        } else {
            this.logger?.info(`Loaded ${total} ${this._logName}(s). ${ok} successful, ${bad} failed.`);
        }

        this.result = {
            ok,
            bad,
            total
        };

        return LoadStatus.successful;
    }

    async write(data) {
        if (!this.loaded) {
            return this.failure("The directory needs to be loaded before files can be written");
        }

        let ok = 0,
            bad = 0;

        for (const filename of Object.keys(data)) {
            const loader = this.loaders[filename],
                fileData = data[filename];

            if (typeof loader === "undefined") {
                this.logger?.warn(`Can't write ${filename}: ${this._logName} isn't loaded.`);
            }

            let status;

            try {
                status = await loader[filename].write(fileData);
            } catch (err) {
                this.failure(err, `Error occured while writing ${this._logName}: ` + filename);

                bad++;
                continue;
            }

            switch (status) {
                case LoadStatus.successful:
                    ok++;
                    break;
                case LoadStatus.failed:
                    bad++;
                    break;
            }
        }

        const total = ok + bad;

        if (total === 0) {
            return this.failure(`Couldn't write any ${this._logName}s.`);
        } else {
            this.logger?.info(`Wrote ${total} ${this._logName}(s). ${ok} successful, ${bad} failed.`);
        }

        this.result = {
            ok,
            bad,
            total
        };

        return LoadStatus.successful;
    }

    getLoader(data, errorIfNotFound = false) {
        let dataLoader;

        for (const loader of this.loaders.data()) {
            if (loader.getData() === data) {
                dataLoader = loader;
                break;
            }
        }

        if (errorIfNotFound && typeof dataLoader === "undefined") {
            return this.failure("Data loader not found");
        }

        return dataLoader;
    }

    getPath(data, errorIfNotFound = false) {
        if (!(this.data instanceof Map)) {
            const loader = this.getLoader(data, errorIfNotFound);
            return loader?.path;
        }

        let dataPath;

        for (const [path, value] of this.data) {
            if (value === data) {
                dataPath = path;
                break;
            }
        }

        if (errorIfNotFound && typeof dataPath === "undefined") {
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
        }

        if (Array.isArray(this.data)) {
            dataDeleted = Util.removeItem(this.data, data);
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

    _checkPath() {
        switch (typeof this._dirPath) {
            case "string":
                return null;
            case "undefined":
                return this.failure("No directory path provided");
            default:
                return this.failure("Invalid directory path provided");
        }
    }

    async _loadFilePaths() {
        this.logger?.debug(`Reading ${this.getName()}...`);

        if (typeof this._dirPath !== "string") {
            return this.failure(`Invalid ${this.getName()}`);
        }

        let files;

        try {
            files = await DirectoryLoader.listFilesRecursive(this._dirPath, this.maxDepth);
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure(`Couldn't find the ${this.getName()}`);
            } else {
                return this.failure(err, `Error occured while reading ${this.getName()}:`);
            }
        }

        files = files.filter(file => !this.excludeDirs.some(excludeDir => file.startsWith(excludeDir)));

        if (this.fileExtension !== "any") {
            files = files.filter(file => path.extname(file) === this.fileExtension);
        }

        this.files = files;

        this.logger?.debug(`Read ${this.getName()}.`);
        return LoadStatus.successful;
    }

    _getLoadArgs(path, options) {
        const throwOnFailure = options.throwOnFailure ?? this.throwOnFailure;

        let loadArgs = [path, this.logger];

        if (typeof options.loaderName !== "undefined") {
            loadArgs = [options.loaderName].concat(loadArgs);
            delete options.loaderName;
        }

        loadArgs.push({
            ...options,
            throwOnFailure,
            parent: this
        });

        return loadArgs;
    }
}

export default DirectoryLoader;
