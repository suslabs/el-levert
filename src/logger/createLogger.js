import winston from "winston";
import path from "node:path";

import LoggerError from "../errors/LoggerError.js";

import getFormat from "./getFormat.js";
import getGlobalFormat from "./GlobalFormat.js";

function getFilename(logFile, level) {
    const parsed = path.parse(logFile),
        date = new Date().toISOString().slice(0, 10);

    let filename = `${date}-${parsed.name}`;

    if (typeof level !== "undefined") {
        filename += `-${level}`;
    }

    filename += parsed.ext;
    return path.join(parsed.dir, filename);
}

function getFileTransport(names, filename, level) {
    if (typeof names === "undefined") {
        throw new LoggerError("A file format must be provided if outputting to a file");
    }

    if (typeof filename === "undefined") {
        throw new LoggerError("A filename must be specified");
    }

    const format = getFormat(names),
        timestampedFilename = getFilename(filename, level);

    const file = new winston.transports.File({
        filename: timestampedFilename,
        format
    });

    return file;
}

function getConsoleTransport(names) {
    if (typeof names === "undefined") {
        throw new LoggerError("A console format must be provided if outputting to the console");
    }

    const format = getFormat(names),
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

    if (typeof config.meta !== "undefined") {
        meta = config.meta;
    }

    if (typeof config.name !== "undefined") {
        meta.service = config.name;
    }

    if (Object.keys(meta).length < 1) {
        meta = undefined;
    }

    return meta;
}

function createLogger(config) {
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
