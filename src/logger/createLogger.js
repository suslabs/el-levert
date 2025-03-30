import winston from "winston";
import path from "node:path";

import getFormat from "./getFormat.js";
import getGlobalFormat from "./GlobalFormat.js";

import LoggerError from "../errors/LoggerError.js";

function getFilePath(logFile, level) {
    const parsed = path.parse(logFile),
        date = new Date().toISOString().slice(0, 10);

    let filename = `${date}-${parsed.name}`;

    if (level != null) {
        filename += `-${level}`;
    }

    filename += parsed.ext;
    return path.join(parsed.dir, filename);
}

function getFileTransport(config, logFile, level) {
    if (config == null) {
        throw new LoggerError("A file format must be provided if outputting to a file");
    }

    const format = getFormat(config),
        filePath = getFilePath(logFile, level);

    const file = new winston.transports.File({
        filename: filePath,
        format
    });

    return file;
}

function getConsoleTransport(config) {
    if (config == null) {
        throw new LoggerError("A console format must be provided if outputting to the console");
    }

    const format = getFormat(config),
        console = new winston.transports.Console({
            format
        });

    return console;
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
    let meta = {};

    if (config.meta != null) {
        meta = config.meta;
    }

    if (config.name != null) {
        meta.service = config.name;
    }

    if (Object.keys(meta).length < 1) {
        meta = undefined;
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
