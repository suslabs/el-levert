import winston from "winston";

import getFormat from "./getFormat.js";
import getGlobalFormat from "./GlobalFormat.js";

import DailyRotateFileTransport from "./DailyRotateFileTransport.js";

import Util from "../util/Util.js";

import LoggerError from "../errors/LoggerError.js";

function getFileTransport(config, level) {
    if (config.fileFormat == null) {
        throw new LoggerError("A file format must be provided if outputting to a file");
    }

    return new DailyRotateFileTransport({
        logFile: config.filename,
        level,
        debugLogRetentionDays: config.debugLogRetentionDays,
        format: getFormat(config.fileFormat)
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
    const level = config.level ?? process.env.LOG_LEVEL ?? "debug";
    const transports = [];

    if (config.filename != null) {
        transports.push(getFileTransport(config, level));
    }

    if (config.consoleOutput) {
        transports.push(getConsoleTransport(config.consoleFormat));
    }

    if (Util.empty(transports)) {
        throw new LoggerError("Must provide an output method");
    }

    return winston.createLogger({
        level,
        transports,
        format: getGlobalFormat(),
        defaultMeta: getDefaultMeta(config)
    });
}

export default createLogger;
