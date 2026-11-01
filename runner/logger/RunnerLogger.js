class RunnerLogger {
    constructor(level = process.env.RUNNER_LOG_LEVEL ?? "info") {
        this.level = level;
    }

    isDebugEnabled() {
        return this.level === "debug";
    }

    info(...args) {
        console.log("[INFO] [runner]", ...args);
    }

    debug(...args) {
        if (this.isDebugEnabled()) {
            console.log("[DEBUG] [runner]", ...args);
        }
    }

    warn(...args) {
        console.warn("[WARN] [runner]", ...args);
    }

    error(...args) {
        console.error("[ERROR] [runner]", ...args);
    }

    log(level, ...args) {
        if (level === "error") {
            this.error(...args);
        } else if (level === "warn") {
            this.warn(...args);
        } else if (level === "debug") {
            this.debug(...args);
        } else {
            this.info(...args);
        }
    }
}

const runnerLogger = new RunnerLogger();

function getRunnerLogger() {
    return runnerLogger;
}

export { RunnerLogger, getRunnerLogger };
export default runnerLogger;
