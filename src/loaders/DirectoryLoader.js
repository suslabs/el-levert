import path from "node:path";

import Loader from "./Loader.js";
import FileLoader from "./FileLoader.js";

import LoadStatus from "./LoadStatus.js";

import Util from "../util/Util.js";

class DirectoryLoader extends Loader {
    constructor(name, dirPath, logger, options = {}) {
        super(name, logger, {
            type: "directory",
            ...options
        });

        if (typeof dirPath === "string") {
            this.dirPath = path.resolve(projRoot, dirPath);
        } else {
            this.dirPath = dirPath;
        }

        this.logName = this.getLogName();

        this.excludeDirs = (options.excludeDirs ?? []).map(dir => path.resolve(projRoot, dir));
        this.fileExtension = options.fileExtension ?? "any";

        this.fileLoaderClass = options.fileLoaderClass ?? FileLoader;
    }

    async load(options = {}) {
        let status = await this._loadFilePaths();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (Util.empty(this.files)) {
            return this.failure(`Couldn't find any ${this.logName}s.`);
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
                this.failure(err, `Error occured while loading ${this.logName}: ` + file);

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
            return this.failure(`Couldn't load any ${this.logName}s.`);
        } else {
            this.logger?.info(`Loaded ${total} ${this.logName}(s). ${ok} successful, ${bad} failed.`);
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
            return this.failure("The directory needs to be loaded before files can be written.");
        }

        let ok = 0,
            bad = 0;

        for (const filename of Object.keys(data)) {
            const loader = this.loaders[filename],
                fileData = data[filename];

            if (typeof loader === "undefined") {
                this.logger?.warn(`Can't write ${filename}: ${this.logName} isn't loaded.`);
            }

            let status;

            try {
                status = await loader[filename].write(fileData);
            } catch (err) {
                this.failure(err, `Error occured while writing ${this.logName}: ` + filename);

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
            return this.failure(`Couldn't write any ${this.logName}s.`);
        } else {
            this.logger?.info(`Wrote ${total} ${this.logName}(s). ${ok} successful, ${bad} failed.`);
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

        for (const [path, value] of this.data.entries()) {
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

    getLogName() {
        return this.name ?? "file";
    }

    _loadFilePaths() {
        this.logger?.debug(`Reading ${this.getName()}...`);

        if (typeof this.dirPath !== "string") {
            return this.failure(`Invalid ${this.getName()}`);
        }

        let files;

        try {
            files = Util.getFilesRecSync(this.dirPath);
        } catch (err) {
            if (err.code === "ENOENT") {
                return this.failure(`Couldn't find the ${this.getName()}`);
            } else {
                return this.failure(err, `Error occured while reading ${this.getName()}:`);
            }
        }

        files = files.filter(file => {
            for (const excludeDir of this.excludeDirs) {
                if (file.startsWith(excludeDir)) {
                    return false;
                }
            }

            return true;
        });

        if (this.fileExtension !== "any") {
            files = files.filter(file => {
                const extension = path.extname(file);
                return extension === this.fileExtension;
            });
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
