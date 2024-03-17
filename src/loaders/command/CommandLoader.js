import DirectoryLoader from "../DirectoryLoader.js";
import CommandObjectLoader from "./CommandObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class CommandLoader extends DirectoryLoader {
    constructor(dirPath, logger, options = {}) {
        super("command", dirPath, logger, {
            ...options,
            fileLoaderClass: CommandObjectLoader,
            throwOnFailure: false
        });
    }

    async load() {
        const status = await super.load({
            throwOnFailure: false
        });

        if (status === LoadStatus.failed) {
            return status;
        }

        const commands = Array.from(this.data.values());
        this.data = commands;

        return LoadStatus.successful;
    }
}

export default CommandLoader;
