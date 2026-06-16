import createLogger from "./logger/createLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultLoggerConfig.js";

import loadConfig from "./config/loadConfig.js";
import { LevertClient } from "./LevertClient.js";

const loggerName = "init",
    logLevel = "info";

const shutdownHandlers = {};

async function shutdownClient(client) {
    if (client.started) {
        await client.stop();
    }
}

function getShutdownExitCode(signal) {
    switch (signal) {
        case "SIGINT":
            return 130;
        case "SIGTERM":
            return 143;
        default:
            return 0;
    }
}

async function shutdownWithCleanup(client, signal) {
    removeShutdownHandlers();

    try {
        await shutdownClient(client);
    } catch (err) {
        client.logger?.error("Error occurred while shutting down:", err);
        process.exit(1);
    }

    process.exit(getShutdownExitCode(signal));
}

async function handleShutdownMessage(client, msg) {
    if (msg !== "shutdown") {
        return;
    }

    await shutdownWithCleanup(client, 0);
}

function setupShutdownHandlers(client) {
    shutdownHandlers.sigint = shutdownWithCleanup.bind(undefined, client, "SIGINT");
    shutdownHandlers.sigterm = shutdownWithCleanup.bind(undefined, client, "SIGTERM");
    shutdownHandlers.message = handleShutdownMessage.bind(undefined, client);

    process.on("SIGINT", shutdownHandlers.sigint);
    process.on("SIGTERM", shutdownHandlers.sigterm);
    process.on("message", shutdownHandlers.message);
}

function removeShutdownHandlers() {
    process.removeListener("SIGINT", shutdownHandlers.sigint);
    process.removeListener("SIGTERM", shutdownHandlers.sigterm);
    process.removeListener("message", shutdownHandlers.message);
}

function setupLogger() {
    const config = getDefaultLoggerConfig(loggerName, null, true, logLevel);
    return createLogger(config);
}

async function init() {
    const logger = setupLogger();

    const configs = await loadConfig(logger);

    if (configs === null) {
        process.exit(1);
    }

    const client = new LevertClient(configs);
    setupShutdownHandlers(client);

    logger.info("Initialized client.");
    logger.end();

    await client.start();
}

export default init;
