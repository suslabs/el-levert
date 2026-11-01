import winston from "winston";

import getFormat from "./getFormat.js";
import getGlobalFormat from "./GlobalFormat.js";

import DailyRotateFileTransport from "./DailyRotateFileTransport.js";

import Util from "../util/Util.js";

import LoggerError from "@el-levert/common/errors/LoggerError.js";

function getFileTransport(config, logFile, level) {
    if (config == null) {
        throw new LoggerError("A file format must be provided if outputting to a file");
    }

    return new DailyRotateFileTransport({
        logFile,
        level,
        format: getFormat(config)
    });
}

function getConsoleTransport(config) {
    if (config == null) {
        throw new LoggerError("A console format must be provided if outputting to the console");
    }

    return new winston.transports.Console({
        format: getFormat(config)
    });
}

function getTransports(config) {
    const transports = [];

    if (config.fileOutput) {
        const fileTransport = getFileTransport(config.fileFormat, config.filename, config.level);
        transports.push(fileTransport);
    }

    if (config.consoleOutput) {
        const consoleTransport = getConsoleTransport(config.consoleFormat);
        transports.push(consoleTransport);
    }

    return transports;
}

function getDefaultMeta(config) {
    const meta = {
        ...(config.meta ?? {}),
        ...(config.name == null ? {} : { service: config.name })
    };

    if (Util.empty(Object.keys(meta))) {
        return undefined;
    }

    return meta;
}

function createLogger(config) {
    config.fileOutput = config.filename != null;

    if (!config.fileOutput && !config.consoleOutput) {
        throw new LoggerError("Must provide an output method");
    }

    config.level ??= process.env.LOG_LEVEL ?? "debug";

    const transports = getTransports(config),
        meta = getDefaultMeta(config);

    const logger = winston.createLogger({
        level: config.level,
        transports,
        format: getGlobalFormat(),
        defaultMeta: meta
    });

    return logger;
}

export default createLogger;
