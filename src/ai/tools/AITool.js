import AIPhases from "../AIPhases.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

import AIError from "../../errors/AIError.js";

class AITool {
    static info = null;

    static maxStatusArgLength = 60;

    constructor(manager) {
        const info = this.constructor.info;

        if (!TypeTester.isObject(info)) {
            throw new AIError("Tool must have info");
        } else if (!AIPhases.has(info.phase)) {
            throw new AIError("Tool must have a valid phase", info.name);
        } else if (typeof this.execute !== "function") {
            throw new AIError("Child class must have an execute function", info.name);
        } else if (typeof this.getStatus !== "function") {
            throw new AIError("Child class must have a getStatus function", info.name);
        }

        this.manager = manager;
    }

    get name() {
        return this.constructor.info.name;
    }

    get phase() {
        return this.constructor.info.phase;
    }

    get declaration() {
        const { name, description, parameters } = this.constructor.info;
        return typeof parameters === "undefined" ? { name, description } : { name, description, parameters };
    }

    usableIn(session) {
        if (typeof this.isAvailable !== "function") {
            return true;
        }

        return this.isAvailable(session);
    }

    formatArg(value) {
        return Util.trimString(String(value ?? "").replaceAll("\n", " "), AITool.maxStatusArgLength);
    }

    createStep(args) {
        return {
            phase: this.phase,
            status: this.getStatus(args)
        };
    }
}

export default AITool;
