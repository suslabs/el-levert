import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import "../../setupGlobals.js";

import createLogger from "../../src/logger/createLogger.js";
import getDefaultLoggerConfig from "../../src/logger/DefaultLoggerConfig.js";

import ConfigLoader from "../../src/loaders/config/ConfigLoader.js";
import TagManager from "../../src/managers/database/TagManager.js";

import DBImporter from "./DBImporter.js";
import DBUpdateModes from "./DBUpdateModes.js";

import { LevertClient } from "./mock/FakeClient.js";

import Util from "../../src/util/Util.js";
import ArrayUtil from "../../src/util/ArrayUtil.js";

function parseArgs() {
    return yargs(hideBin(process.argv))
        .usage("Usage: npm run importer [options]")
        .options({
            path: {
                alias: "p",
                type: "string",
                describe: "Path to the tags file (.json or .db)"
            },
            "json-path": {
                alias: "j",
                type: "string",
                describe: "Path to the tags JSON file (legacy alias)"
            },
            owners: {
                alias: "o",
                type: "array",
                string: true,
                describe: "Owner ID(s) to import"
            },
            amend: {
                alias: "a",
                type: "boolean",
                default: false,
                describe: "Amend existing tags"
            },
            fix: {
                alias: "x",
                type: "boolean",
                default: false,
                describe: "Automatically fix DB issues"
            },
            "purge-old": {
                alias: "1",
                type: "boolean",
                default: false,
                describe: "Purge old tags"
            },
            audit: {
                alias: "l",
                type: "boolean",
                default: false,
                describe: "Write tag revisions to the audit log"
            }
        })
        .alias("help", "h")
        .help("help")
        .version(false)
        .strict()
        .parseSync();
}

function getInputValues(argv) {
    if (argv == null) {
        return null;
    }

    let targetPath = argv.path ?? argv["json-path"] ?? "",
        amend = argv.amend ?? false,
        fix = argv.fix ?? false,
        purgeOld = argv["purge-old"] ?? false,
        audit = argv.audit ?? false;

    targetPath = targetPath.trim();

    if (Util.empty(targetPath)) {
        if (!fix && !purgeOld) {
            yargs(hideBin(process.argv)).showHelp();
            return null;
        }

        if (fix) {
            purgeOld = false;
        } else if (purgeOld) {
            fix = false;
        }
    } else {
        targetPath = path.resolve(targetPath);
        fix = purgeOld = false;
    }

    let ownerIds = null;

    if (argv.owners != null) {
        ownerIds = ArrayUtil.guaranteeArray(argv.owners)
            .flatMap(item => String(item).split(","))
            .map(id => id.trim())
            .filter(id => !Util.empty(id));

        if (Util.empty(ownerIds)) {
            ownerIds = null;
        }
    }

    return {
        path: targetPath,
        owners: ownerIds,
        amend,
        fix,
        purgeOld,
        audit
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

    return await configLoader
        .load()
        .then(res => Util.first(res))
        .finally(() => configLogger.close());
}

function loadClient(config, logger, options) {
    return new LevertClient(config, logger, options);
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
    const client = loadClient(config, logger, {
            enableAuditLog: input.audit
        }),
        tagManager = await loadTagManager();

    const importer = new DBImporter(tagManager, logger);

    if (!Util.empty(input.path)) {
        const updateMode = Object.values(DBUpdateModes)[Number(input.amend)];
        await importer.updateDatabase(input.path, updateMode, {
            owners: input.owners
        });
    } else if (input.fix) {
        await importer.fix();
    } else if (input.purgeOld) {
        await importer.purgeOld();
    }

    await tagManager.unload();
    process.exit(0);
})();
