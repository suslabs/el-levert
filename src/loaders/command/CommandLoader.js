import DirectoryLoader from "../DirectoryLoader.js";
import CommandObjectLoader from "./CommandObjectLoader.js";

import ArrayUtil from "../../util/ArrayUtil.js";

import LoadStatus from "../LoadStatus.js";

class CommandLoader extends DirectoryLoader {
    constructor(dirPath, logger, options = {}) {
        super("command", dirPath, logger, {
            throwOnFailure: false,
            ...options,
            dataField: "commands",
            fileLoaderClass: CommandObjectLoader
        });

        this.commandClass = options.commandClass;
        this.extraOptions = options.extraOptions;
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this._getCommands();

        return LoadStatus.successful;
    }

    deleteCommands() {
        this.logger?.debug("Deleting commands...");

        this.deleteAllData();

        const n = ArrayUtil.wipeArray(this.commands);
        delete this.commands;

        this.logger?.debug(`Deleted ${n} commands.`);
        return n;
    }

    getLoadingMessage() {
        return `Loading ${this.name}s...`;
    }

    getLoadedMessage() {
        return `Loaded ${this.name}s successfully.`;
    }

    _getCommands() {
        if (typeof this.commands === "undefined") {
            const commands = Array.from(this.data.values());
            this.commands = commands;
        }

        return this.commands;
    }
}

export default CommandLoader;
