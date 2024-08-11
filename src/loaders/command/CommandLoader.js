import DirectoryLoader from "../DirectoryLoader.js";
import CommandObjectLoader from "./CommandObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class CommandLoader extends DirectoryLoader {
    constructor(dirPath, logger, options = {}) {
        super("command", dirPath, logger, {
            throwOnFailure: false,
            ...options,
            dataField: "commands",
            fileLoaderClass: CommandObjectLoader
        });
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.getCommands();

        return LoadStatus.successful;
    }

    getCommands() {
        if (typeof this.commands === "undefined") {
            const commands = Array.from(this.data.values());
            this.commands = commands;
        }

        return this.commands;
    }

    deleteCommands() {
        this.logger?.debug("Deleting commands...");

        let i = 0;
        for (; i < this.commands.length; i++) {
            delete this.commands[i];
        }

        delete this.commands;
        this.deleteAllData();

        this.logger?.debug(`Deleted ${i} commands.`);
    }

    getLoadingMessage() {
        return `Loading ${this.name}s...`;
    }

    getLoadedMessage() {
        return `Loaded ${this.name}s successfully.`;
    }
}

export default CommandLoader;
