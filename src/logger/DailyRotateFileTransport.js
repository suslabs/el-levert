import path from "node:path";

import winston from "winston";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

import LoggerError from "@el-levert/common/errors/LoggerError.js";

function getFilename(logFile, level, date) {
    const parsed = path.parse(logFile);

    let filename = `${date}-${parsed.name}`;

    if (level != null) {
        filename += `-${level}`;
    }

    filename += parsed.ext;
    return filename;
}

function syncFileState(target) {
    const date = new Date().toISOString().slice(0, 10),
        filename = getFilename(target.logFile, target.level, date);

    if (date === target.currentDate) {
        return false;
    }

    target.currentDate = date;
    target.filename = filename;
    target._basename = filename;

    return true;
}

class DailyRotateFileTransport extends winston.transports.File {
    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);

        if (!Util.nonemptyString(options.logFile)) {
            throw new LoggerError("A log file path must be provided");
        }

        options.dirname = path.dirname(options.logFile);
        syncFileState(options);

        super(options);

        this.logFile = options.logFile;
        this.currentDate = options.currentDate;
    }

    log(info, callback) {
        if (syncFileState(this)) {
            this._runRotation();
        }

        return super.log(info, callback);
    }

    _runRotation() {
        this._rotate = true;
        this._endStream(() => {
            this.open();
        });
    }
}

export default DailyRotateFileTransport;
