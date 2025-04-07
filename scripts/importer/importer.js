import path from "node:path";
import { parseArgs as nodeParseArgs } from "node:util";

import "../../setupGlobals.js";

import createLogger from "../../src/logger/createLogger.js";
import getDefaultLoggerConfig from "../../src/logger/DefaultLoggerConfig.js";

import ConfigLoader from "../../src/loaders/config/ConfigLoader.js";

import { LevertClient } from "./mock/FakeClient.js";
import TagManager from "../../src/managers/database/TagManager.js";

import DBImporter from "./DBImporter.js";

import Util from "../../src/util/Util.js";

const help = "Usage: npm run importer [--json-path tags.json] [--fix] [--purge-old] ",
    usage = "See npm run importer --help for usage.";

const argsOptions = {
    help: {
        type: "boolean",
        short: "h"
    },
    "json-path": {
        type: "string",
        short: "i"
    },
    fix: {
        type: "boolean",
        short: "x"
    },
    "purge-old": {
        type: "boolean",
        short: "1"
    }
};

function parseArgs() {
    let args;

    try {
        args = nodeParseArgs({
            options: argsOptions,
            args: process.argv.slice(2)
        });
    } catch (err) {
        if (err.code?.startsWith("ERR_PARSE")) {
            console.error(`Error: ${err.message}.`);
            console.log(usage);

            return null;
        }

        throw err;
    }

    return args;
}

function getInputValues(args) {
    if (args === null) {
        return null;
    }

    const argsNames = Object.keys(args.values),
        showHelp = Util.empty(argsNames) || args.values.help;

    if (showHelp) {
        console.log(help);
        return null;
    }

    let jsonPath = args.values["json-path"] ?? "",
        fix = args.values.fix ?? false,
        purgeOld = args.values["purge-old"] ?? false;

    if (Util.empty(jsonPath)) {
        if (!fix && !purgeOld) {
            console.log(help);
            return null;
        }

        if (fix) {
            purgeOld = false;
        } else if (purgeOld) {
            fix = false;
        }
    } else {
        jsonPath = path.resolve(jsonPath);
        fix = purgeOld = false;
    }

    return {
        jsonPath,
        fix,
        purgeOld
    };
}

const loggerName = "Importer",
    logLevel = "info";

function setupLogger(name, logFile) {
    const loggerConfig = getDefaultLoggerConfig(name, logFile, true, logLevel);
    return createLogger(loggerConfig);
}

async function loadConfig() {
    const configLogger = setupLogger("Init"),
        configLoader = new ConfigLoader(configLogger);

    try {
        const [config] = await configLoader.load();
        return config;
    } finally {
        configLogger.close();
    }
}

function loadClient(config, logger) {
    return new LevertClient(config, logger);
}

async function loadTagManager() {
    const tagManager = new TagManager();
    await tagManager.load();

    return tagManager;
}

(async () => {
    const args = parseArgs();

    if (args === null) {
        process.exit(1);
    }

    const input = getInputValues(args);

    if (input === null) {
        process.exit(1);
    }

    const config = await loadConfig(),
        logger = setupLogger(loggerName, config.importLogFile);

    // eslint-disable-next-line unused-imports/no-unused-vars
    const client = loadClient(config, logger),
        tagManager = await loadTagManager();

    const importer = new DBImporter(tagManager, logger);

    if (!Util.empty(input.jsonPath)) {
        await importer.updateDatabase(input.jsonPath);
    } else if (input.fix) {
        await importer.fix();
    } else if (input.purgeOld) {
        await importer.purgeOld();
    }

    await tagManager.unload();
    process.exit(0);
})();
