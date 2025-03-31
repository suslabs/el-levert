import readline from "node:readline/promises";

import Manager from "../Manager.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import ManagerError from "../../errors/ManagerError.js";

class InputManager extends Manager {
    static $name = "inputManager";

    constructor(enabled, inputPrompt, options = {}) {
        super(enabled, options);

        this.prompt = inputPrompt;

        this.handleInput = options.handleInput;
        this.exitCommand = typeof options.exitCmd === "undefined" ? "exit" : options.exitCmd;
        this.onExit = options.onExit;

        this._aborter = null;
        this.rl = null;

        this.loopRunning = false;
        this._active = false;
    }

    get active() {
        return this._active;
    }

    set active(value) {
        if (this._active === value) {
            return;
        }

        this._active = value;

        if (value) {
            this.load();
        } else {
            this.unload();
        }
    }

    load() {
        if (this.loopRunning || !this._active) {
            return;
        }

        this._setupReadline();
        this._startInputLoop();
    }

    async unload() {
        if (!this.loopRunning) {
            return;
        }

        await this._stopInputLoop();
    }

    static _cleanInput(input) {
        input = String(input);
        return input.trim().replaceAll("\n", " ");
    }

    _setupReadline() {
        this._aborter = new AbortController();

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    _startInputLoop() {
        this.loopRunning = true;
        this._loopPromise = this._runInputLoop();
    }

    async _stopInputLoop() {
        if (typeof this.onExit === "function") {
            this.onExit();
        }

        this.loopRunning = false;

        this._aborter.abort();
        this.rl.close();

        delete this._loopPromise;

        this.rl = null;
        this._aborter = null;
    }

    async _runInputLoop() {
        while (this.loopRunning) {
            const prompt = this.prompt + " ",
                input = await this.rl
                    .question(prompt, {
                        signal: this._aborter.signal
                    })
                    .catch(err => {});

            await this._handleInput(input);
        }
    }

    async _handleInput(input) {
        if (!this._active) {
            return;
        }

        input = InputManager._cleanInput(input);

        if (Util.empty(input)) {
            return;
        } else if (input === this.exitCommand) {
            return this.unload();
        } else if (typeof this.handleInput !== "function") {
            return;
        }

        try {
            await this.handleInput(input);
        } catch (err) {
            getLogger().error("Error occured while processing input:", err);
        }
    }
}

export default InputManager;
