import RunnerServer from "./RunnerServer.js";

import { getRunnerLogger } from "./logger/RunnerLogger.js";

const port = process.env.RUNNER_PORT ? Number(process.env.RUNNER_PORT) : 9123,
    host = process.env.RUNNER_HOST ?? "127.0.0.1";

const server = new RunnerServer({ port, host });

function shutdown(signal) {
    getRunnerLogger().info(`Received ${signal}, shutting down VM runner...`);
    server.stop();
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("message", msg => {
    if (msg === "shutdown") {
        shutdown("shutdown message");
    }
});

server.start();

