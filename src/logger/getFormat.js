import winston from "winston";

import CreateLoggerError from "../errors/CreateLoggerError.js";

const validFormats = Object.getOwnPropertyNames(winston.format).filter(name => !["length", "combine"].includes(name));

function getFormat(config) {
    if (config === undefined) {
        return winston.format.simple();
    } else if (typeof config === "string") {
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
            throw new CreateLoggerError("Invalid format: " + name);
        }

        return winston.format[name](opts);
    });

    return winston.format.combine(...formats);
}

export default getFormat;
