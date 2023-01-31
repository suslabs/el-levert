import winston from "winston";
import path from "path";
const { transports, format } = winston;

import LoggerError from "../errors/LoggerError.js";

const validForm = Object.getOwnPropertyNames(format).filter(x =>
    !(["length", "combine"].includes(x))
);

function getFormat(names) {
    if(typeof names === "undefined") {
        return format.simple();
    } else if(typeof names === "string") {
        names = [names];
    }
    
    const formats = names.map(x => {
        let name, prop;
        
        if(typeof x === "object") {
            ({
                "name": name,
                "prop": prop
            } = x);
        } else {
            name = x;
        }
        
        if(!validForm.includes(name)) {
            throw new LoggerError("Invalid format: " + x);
        }
        
        return format[name](prop);
    });
    
    return format.combine(...formats);
}

function getFilename(name) {
    const file = path.basename(name),
          dir = path.dirname(name),
          date = new Date().toISOString().substring(0,10);

    return path.join(dir, date + "-" + file);
}

function addConsole(logger, format) {
    logger.add(new transports.Console({
        format: format
    }));
}

function createLogger(config = {}) {
    if(typeof config.filename === "undefined") {
        return {};
    }

    const file = new transports.File({
        filename: getFilename(config.filename),
        format: getFormat(config.fileFormat)
    });
    
    let meta;
    
    if(typeof config.name !== "undefined") {
        meta = {
            service: config.name
        };
    }
    
    const logger = winston.createLogger({
        level: config.level || "debug",
        transports: [
            file
        ],
        defaultMeta: meta
    });

    if(config.console) {
        addConsole(logger, getFormat(config.consoleFormat));
    }
    
    return logger;
}

export default createLogger;