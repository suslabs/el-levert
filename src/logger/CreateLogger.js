import winston from "winston";
import path from "path";

import CreateLoggerError from "../errors/LoggerError.js";

const validForm = Object.getOwnPropertyNames(winston.format).filter(x => !["length", "combine"].includes(x));

function getFormat(names) {
    if (names === undefined) {
        return winston.format.simple();
    } else if (typeof names === "string") {
        names = [names];
    }

    const formats = names.map(x => {
        let name, prop;

        if (typeof x === "object") {
            ({ name: name, prop: prop } = x);
        } else {
            name = x;
        }

        if (!validForm.includes(name)) {
            throw new CreateLoggerError("Invalid format: " + x);
        }

        return winston.format[name](prop);
    });

    return winston.format.combine(...formats);
}

const enumerateErrorFormat = winston.format(info => {
    if (info.message instanceof Error) {
        info.message = Object.assign(
            {
                message: info.message.message,
                stack: info.message.stack
            },
            info.message
        );
    }

    if (info instanceof Error) {
        return Object.assign(
            {
                message: info.message,
                stack: info.stack
            },
            info
        );
    }

    return info;
});

function getFilename(name) {
    const file = path.basename(name),
        dir = path.dirname(name),
        date = new Date().toISOString().substring(0, 10);

    return path.join(dir, date + "-" + file);
}

function getFileTransport(names, filename) {
    if (names === undefined) {
        throw new CreateLoggerError("A file format must be provided if outputting to a file");
    }

    if (filename === undefined) {
        throw new CreateLoggerError("A filename must be specified");
    }

    const format = getFormat(names),
        timestampedFilename = getFilename(filename);

    const file = new winston.transports.File({
        filename: timestampedFilename,
        format
    });

    return file;
}

function getConsoleTransport(names) {
    if (names === undefined) {
        throw new CreateLoggerError("A console format must be provided if outputting to the console");
    }

    const format = getFormat(names),
        console = new winston.transports.Console({
            format
        });

    return console;
}

function createLogger(config) {
    if (!config.fileOutput && !config.consoleOutput) {
        throw new CreateLoggerError("Must provide an output method");
    }

    const transports = [];

    if (config.fileOutput) {
        const fileTransport = getFileTransport(config.fileFormat, config.filename);
        transports.push(fileTransport);
    }

    if (config.consoleOutput) {
        const consoleTransport = getConsoleTransport(config.consoleFormat);
        transports.push(consoleTransport);
    }

    const level = config.level ?? "debug";
    let meta;

    if (config.name !== undefined) {
        meta = {
            service: config.name
        };
    }

    const logger = winston.createLogger({
        level,
        format: enumerateErrorFormat(),
        transports,
        defaultMeta: meta
    });

    return logger;
}

export default createLogger;
