import fs from "node:fs";
import path from "node:path";

import winston from "winston";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DateUtil from "../util/misc/DateUtil.js";

import LoggerError from "../errors/LoggerError.js";

const dayLength = Util.durationSeconds.day / Util.durationSeconds.milli;

class DailyRotateFileTransport extends winston.transports.File {
    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);

        const logFile = options.logFile;

        if (!Util.nonemptyString(logFile)) {
            throw new LoggerError("A log file path must be provided");
        }

        const date = DateUtil.today();

        const { dir, name, ext } = path.parse(logFile);
        const suffix = DailyRotateFileTransport._getSuffix(name, ext, options.level);

        super({ ...options, dirname: dir || ".", filename: `${date}${suffix}` });

        this._date = date;
        this._suffix = suffix;
        this._debugSuffix = DailyRotateFileTransport._getSuffix(name, ext, "debug");
        this._retentionDays = options.debugLogRetentionDays ?? -1;

        this._pruneDebugLogs();
    }

    log(info, callback) {
        const date = DateUtil.today();

        if (date !== this._date) {
            this._date = date;
            this.filename = this._basename = `${date}${this._suffix}`;

            this._rotate = true;
            this._endStream(() => this.open());

            this._pruneDebugLogs();
        }

        return super.log(info, callback);
    }

    static _logDate = /^\d{4}-\d{2}-\d{2}$/;

    static _getSuffix(name, ext, level) {
        return level == null ? `-${name}${ext}` : `-${name}-${level}${ext}`;
    }

    _pruneDebugLogs() {
        if (this._retentionDays <= 0) {
            return;
        }

        const cutoff = Date.parse(this._date) - (this._retentionDays - 1) * dayLength;

        try {
            for (const entry of fs.readdirSync(this.dirname, { withFileTypes: true })) {
                const date = entry.name.slice(0, this._date.length);

                if (
                    !entry.isFile() ||
                    !DailyRotateFileTransport._logDate.test(date) ||
                    entry.name !== `${date}${this._debugSuffix}`
                ) {
                    continue;
                }

                const day = Date.parse(date);

                if (day < cutoff && new Date(day).toISOString().startsWith(date)) {
                    fs.rmSync(path.join(this.dirname, entry.name), { force: true });
                }
            }
        } catch (err) {
            if (err.code !== "ENOENT") {
                process.emitWarning("Could not prune expired debug logs", { code: "DEBUG_LOG_RETENTION" });
            }
        }
    }
}

export default DailyRotateFileTransport;
