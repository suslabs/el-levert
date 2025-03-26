import winston from "winston";

import LoggerError from "../errors/LoggerError.js";

const validFormats = Object.getOwnPropertyNames(winston.format).filter(name => !["length", "combine"].includes(name));

function getFormat(config) {
    switch (typeof config) {
        case "undefined":
            return winston.format.simple();
        case "string":
            config = [config];
    }

    const formats = config.map(format => {
        let name, opts;

        if (typeof format === "object") {
            ({ name, opts } = format);
        } else {
            name = format;
        }

        if (!validFormats.includes(name)) {
            throw new LoggerError("Invalid format: " + name);
        }

        return winston.format[name](opts);
    });

    return winston.format.combine(...formats);
}

export default getFormat;
