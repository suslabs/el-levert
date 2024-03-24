import path from "path";

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
            this.dirPath = path.resolve(dirPath);
        } else {
            this.dirPath = dirPath;
        }

        this.logName = this.getLogName();

        this.excludeDirs = options.excludeDirs ?? [];
        this.fileExtension = options.fileExtension ?? "any";
        this.fileLoaderClass = options.fileLoaderClass ?? FileLoader;
    }

    getLogName() {
        return this.name ?? "file";
    }

    loadFilePaths() {
        this.logger?.info(`Reading ${this.getName()}...`);

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

        const excludeDirs = this.excludeDirs.map(dir => path.resolve(dir));

        files = files.filter(file => {
            for (const excludeDir of excludeDirs) {
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

        this.logger?.info(`Read ${this.getName()}.`);
        return LoadStatus.successful;
    }

    deleteData() {
        if (this.loaders instanceof Map) {
            for (const path of this.loaders.keys()) {
                this.loaders.delete(path);
            }
        } else {
            this.loaders = new Map();
        }

        if (this.data instanceof Map) {
            for (const path of this.data.keys()) {
                this.data.delete(path);
            }
        } else {
            this.data = new Map();
        }
    }

    getLoadArgs(path, options) {
        const throwOnFailure = options.throwOnFailure ?? this.throwOnFailure;

        let loadArgs = [path, this.logger];

        if (typeof options.loaderName !== "undefined") {
            loadArgs = [options.loaderName].concat(loadArgs);
            delete options.loaderName;
        }

        loadArgs.push({
            ...options,
            throwOnFailure
        });

        return loadArgs;
    }

    async load(options = {}) {
        let status = await this.loadFilePaths();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (this.files.length === 0) {
            return this.failure(`Couldn't find any ${this.logName}s.`);
        }

        this.deleteData();

        let ok = 0,
            bad = 0;

        for (const file of this.files) {
            const loadArgs = this.getLoadArgs(file, options),
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
                this.failure(err, `Error occured while writing ${this.logName}: ` + file);

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
}

export default DirectoryLoader;
