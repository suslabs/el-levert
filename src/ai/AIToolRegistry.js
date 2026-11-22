import * as Tools from "./tools/tools.js";

import AIPhases from "./AIPhases.js";

import Util from "../util/Util.js";

class AIToolRegistry {
    static expectedErrors = new Set(["AIError", "UtilError", "TagError", "VMError", "AxiosError"]);

    constructor(manager, maxOutput) {
        this.maxOutput = maxOutput;
        this.tools = new Map(Object.values(Tools).map(_class => [_class.info.name, new _class(manager)]));
    }

    getAvailable(session) {
        return Array.from(this.tools.values()).filter(tool => tool.usableIn(session));
    }

    getDeclarations(session) {
        return this.getAvailable(session).map(tool => tool.declaration);
    }

    getNames(session) {
        return this.getAvailable(session).map(tool => tool.name);
    }

    get(name, session) {
        const tool = this.tools.get(name);
        return tool?.usableIn(session) ? tool : null;
    }

    createStep(name, args, session) {
        const tool = this.get(name, session);

        if (tool === null) {
            return { phase: AIPhases.thinking, status: `Calling ${name}` };
        }

        return tool.createStep(args ?? {});
    }

    async execute(name, args, session) {
        const tool = this.get(name, session);

        if (tool === null) {
            return { error: `Unknown tool "${name}".` };
        }

        let out;

        try {
            out = await tool.execute(args ?? {}, session);
        } catch (err) {
            if (!AIToolRegistry.expectedErrors.has(err.name)) {
                session.logError(name, err);
            }

            out = { error: Util.getErrorMessage(err) };
        }

        return this._limitOutput(out);
    }

    _limitOutput(out) {
        const text = JSON.stringify(out ?? null);

        if (text.length <= this.maxOutput) {
            return out;
        }

        return {
            truncated: true,
            partial: text.slice(0, this.maxOutput)
        };
    }
}

export default AIToolRegistry;
