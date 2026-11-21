import TypeTester from "../../util/TypeTester.js";

import AIError from "../../errors/AIError.js";

class AITool {
    static info = null;

    constructor(manager) {
        const info = this.constructor.info;

        if (!TypeTester.isObject(info)) {
            throw new AIError("Tool must have info");
        } else if (typeof this.execute !== "function") {
            throw new AIError("Child class must have an execute function", info.name);
        }

        this.manager = manager;
    }

    get name() {
        return this.constructor.info.name;
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
}

export default AITool;
