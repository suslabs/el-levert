import DirectoryLoader from "../DirectoryLoader.js";
import CommandObjectLoader from "./CommandObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class CommandLoader extends DirectoryLoader {
    constructor(dirPath, logger, options = {}) {
        super("command", dirPath, logger, {
            throwOnFailure: false,
            ...options,
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
        const commands = Array.from(this.data.values());

        this.commands = commands;
        this.data = commands;
    }

    deleteCommands() {
        this.logger?.info("Deleting commands...");

        let i = 0;
        for (; i < this.commands.length; i++) {
            delete this.commands[i];
        }

        while (this.commands.length > 0) {
            this.commands.shift();
        }

        this.logger?.info(`Deleted ${i} commands.`);
    }

    getLoadingMessage() {
        return `Loading ${this.name}s...`;
    }

    getLoadedMessage() {
        return `Loaded ${this.name}s successfully.`;
    }
}

export default CommandLoader;
