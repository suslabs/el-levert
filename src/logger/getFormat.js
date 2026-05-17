import winston from "winston";

import TypeTester from "../util/TypeTester.js";
import ArrayUtil from "../util/ArrayUtil.js";
import { invalidFormats } from "./InvalidFormats.js";

import LoggerError from "../errors/LoggerError.js";
const validFormats = new Set(
    Object.getOwnPropertyNames(winston.format).filter(name => !invalidFormats.has(name))
);

function getFormat(config) {
    if (config == null) {
        return winston.format.simple();
    } else {
        config = ArrayUtil.guaranteeArray(config);
    }

    const formats = config.map(format => {
        let name, opts;

        if (TypeTester.isObject(format)) {
            ({ name, opts } = format);
        } else {
            name = format;
        }

        if (!validFormats.has(name)) {
            throw new LoggerError("Invalid format: " + name, name);
        }

        return winston.format[name](opts);
    });

    return winston.format.combine(...formats);
}

export default getFormat;
