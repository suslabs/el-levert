import DirectoryLoader from "../DirectoryLoader.js";
import CommandObjectLoader from "./CommandObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

import Util from "../../util/Util.js";

class CommandLoader extends DirectoryLoader {
    constructor(dirPath, logger, options = {}) {
        super("command", dirPath, logger, {
            throwOnFailure: false,
            ...options,
            dataField: "commands",
            fileLoaderClass: CommandObjectLoader
        });

        this.prefix = options.prefix;
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this._getCommands();

        return LoadStatus.successful;
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

    _deleteCommands() {
        this.logger?.debug("Deleting commands...");

        this.deleteAllData();

        const n = Util.wipeArray(this.commands);
        delete this.commands;

        this.logger?.debug(`Deleted ${n} commands.`);
    }
}

export default CommandLoader;
