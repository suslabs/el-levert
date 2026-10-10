import readline from "node:readline";

import Util from "../Util.js";
import ObjectUtil from "../ObjectUtil.js";

class ProgressTracker {
    static defaultOptions = Object.freeze({
        width: 30,
        stream: process.stderr,
        showPercent: true,
        showCount: true,
        completeChar: "=",
        headChar: ">",
        incompleteChar: " ",
        bracketLeft: "[",
        bracketRight: "]"
    });

    constructor(totalWork = 0, options = {}) {
        if (typeof totalWork === "object" && totalWork !== null) {
            options = totalWork;
            totalWork = options.totalWork ?? 0;
        }

        options = ObjectUtil.guaranteeObject(options);

        this.totalWork = Math.max(Number(totalWork) || 0, 0);
        this.options = options;

        this._initCliConfig(options);
        this.callbacks = options.callbacks ?? null;

        this.completedWork = 0;
        this.completed = false;
        this.startTime = Date.now();
        this.endTime = null;
        this.lastEmitted = -1;
        this.label = "";

        if (this.totalWork > 0) {
            this._emitProgress(0, false);
        }
    }

    get elapsed() {
        const end = this.completed && this.endTime !== null ? this.endTime : Date.now();
        return Math.max(end - this.startTime, 0);
    }

    get percentage() {
        if (this.totalWork === 0) {
            return 100;
        }

        return Math.floor((this.completedWork * 100) / this.totalWork);
    }

    get opsPerSecond() {
        const timeSec = this.elapsed / 1000;

        if (timeSec <= 0) {
            return 0;
        }

        const work = this.completed ? this.totalWork : this.completedWork;
        return work / timeSec;
    }

    start(totalWork = null, label = null) {
        if (totalWork !== null) {
            this.totalWork = Math.max(Number(totalWork) || 0, 0);
        }

        this.completedWork = 0;
        this.completed = false;
        this.startTime = Date.now();
        this.endTime = null;
        this.lastEmitted = -1;

        if (label !== null) {
            this.label = String(label ?? "");
        }

        this._emitProgress(0, false);
    }

    update(processed = 1, emitUpdate = true) {
        if (this.completed) {
            return;
        }

        const [perc, last] = this._updateWork(processed);

        if (emitUpdate) {
            const isTty = this.stream?.isTTY ?? false,
                shouldEmit = isTty || perc - last >= this.emitStep || perc === 100;

            if (shouldEmit) {
                this._emitProgress(perc, false);
            }
        }
    }

    tick(amount = 1, label = null) {
        if (label !== null) {
            this.label = String(label ?? "");
        }

        this.update(amount, true);
    }

    setLabel(label) {
        this.label = String(label ?? "");

        if (this.stream?.isTTY && !this.completed) {
            this._renderLine();
        }
    }

    clear() {
        this._clearLine();
    }

    complete(emitUpdate = true) {
        this.completed = true;
        this.endTime = Date.now();

        if (emitUpdate) {
            this._emitProgress(100, true);
        }
    }

    finish(message = null) {
        if (!this.completed) {
            this.complete(true);
        }

        if (this.stream?.isTTY) {
            this._clearLine();
        }

        if (Util.nonemptyString(message)) {
            this.stream?.write(`${message}\n`);
        }
    }

    _initCliConfig(options) {
        const defaults = this.constructor.defaultOptions;

        this.width = options.width ?? defaults.width;
        this.stream = options.stream ?? defaults.stream;
        this.showPercent = options.showPercent ?? defaults.showPercent;
        this.showCount = options.showCount ?? defaults.showCount;

        this.completeChar = options.completeChar ?? defaults.completeChar;
        this.headChar = options.headChar ?? defaults.headChar;
        this.incompleteChar = options.incompleteChar ?? defaults.incompleteChar;
        this.bracketLeft = options.bracketLeft ?? defaults.bracketLeft;
        this.bracketRight = options.bracketRight ?? defaults.bracketRight;

        this.emitStep = options.emitStep ?? options.step ?? (this.stream?.isTTY ? 1 : 20);
    }

    _clearLine() {
        if (!this.stream?.isTTY) {
            return;
        }

        readline.cursorTo(this.stream, 0);
        readline.clearLine(this.stream, 0);
    }

    _getBar(ratio) {
        const completeLength = Math.round(this.width * ratio),
            incompleteLength = this.width - completeLength;

        if (completeLength > 0 && incompleteLength > 0) {
            return (
                this.completeChar.repeat(completeLength - 1) +
                this.headChar +
                this.incompleteChar.repeat(incompleteLength)
            );
        }

        if (completeLength === this.width) {
            return this.completeChar.repeat(this.width);
        }

        return this.incompleteChar.repeat(this.width);
    }

    _formatLine() {
        const parts = [];

        if (this.totalWork > 0) {
            const ratio = Math.min(Math.max(this.completedWork / this.totalWork, 0), 1),
                percent = Math.floor(ratio * 100),
                bar = this._getBar(ratio);

            parts.push(`${this.bracketLeft}${bar}${this.bracketRight}`);

            if (this.showPercent) {
                parts.push(`${String(percent).padStart(3)}%`);
            }

            if (this.showCount) {
                parts.push(`(${this.completedWork}/${this.totalWork})`);
            }
        }

        if (Util.nonemptyString(this.label)) {
            parts.push(this.label);
        }

        return parts.join(" ");
    }

    _writeLine(line) {
        if (this.stream?.isTTY) {
            this._clearLine();
            this.stream.write(line);
            return;
        }

        this.stream?.write(`${line}\n`);
    }

    _renderLine() {
        const line = this._formatLine();
        this._writeLine(line);
    }

    _emitProgress(perc, completed) {
        const event = {
            percentage: perc,
            opsPerSecond: this.opsPerSecond,
            elapsed: this.elapsed,
            completedWork: this.completedWork,
            totalWork: this.totalWork,
            completed,
            label: this.label
        };

        const callbacks = this.callbacks;

        if (typeof callbacks?.onProgress === "function") {
            callbacks.onProgress(event);
        }

        if (this.options.render !== false && this.stream != null) {
            this._renderLine();
        }

        this.lastEmitted = perc;
    }

    _updateWork(processed) {
        const delta = Math.max(Number(processed) || 1, 0);
        this.completedWork += delta;

        if (this.totalWork > 0) {
            this.completedWork = Math.min(this.completedWork, this.totalWork);
        }

        const perc = this.percentage,
            last = this.lastEmitted;

        return [perc, last];
    }
}

export default ProgressTracker;
