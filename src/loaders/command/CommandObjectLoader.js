import ObjectLoader from "../ObjectLoader.js";

import TypeTester from "../../util/TypeTester.js";
import deriveCommandClass from "../../util/commands/deriveCommandClass.js";

import LoadStatus from "../LoadStatus.js";

class CommandObjectLoader extends ObjectLoader {
    constructor(filePath, logger, options) {
        options = TypeTester.isObject(options) ? options : {};

        super("command", filePath, logger, {
            throwOnFailure: false,
            ...options,
            type: null
        });
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const plainExport = this.data.default ?? this.data,
            plainClass = typeof plainExport === "function" ? plainExport : null;

        if (typeof plainClass !== "function") {
            return this.failure("Command files must export a default class");
        }

        const DerivedCommand = deriveCommandClass(this.parentLoader.commandClass, plainClass),
            command = new DerivedCommand({
                ...plainClass.info,
                ...this.parentLoader.extraOptions
            });

        Object.assign(command, new plainClass());

        this.data = command;

        let shouldLoad = true;

        if (typeof command.load === "function") {
            try {
                shouldLoad = (await command.load()) ?? shouldLoad;
            } catch (err) {
                return this.failure(err, "Error occured while loading command:");
            }
        }

        return shouldLoad ? LoadStatus.successful : LoadStatus.ignore;
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this.data.name}`;
    }

    getIgnoredMessage() {
        return `Didn't load ${this.getName()}: ${this.data.name}`;
    }
}

export default CommandObjectLoader;
