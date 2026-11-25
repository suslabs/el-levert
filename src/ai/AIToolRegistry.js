import * as Tools from "./tools/tools.js";

import AIPhases from "../structures/ai/AIPhases.js";

class AIToolRegistry {
    static unknownToolEmoji = "❔";

    constructor(manager) {
        this.tools = new Map(Object.values(Tools).map(_class => [_class.info.name, new _class(manager)]));
    }

    getRegisteredNames() {
        return Array.from(this.tools.keys());
    }

    getAvailable(session) {
        return Array.from(this.tools.values()).filter(tool => AIToolRegistry._isAvailable(tool, session));
    }

    getDeclarations(session) {
        return this.getAvailable(session).map(tool => tool.declaration);
    }

    getNames(session) {
        return this.getAvailable(session).map(tool => tool.name);
    }

    get(name, session) {
        const tool = this.tools.get(name);
        return typeof tool !== "undefined" && AIToolRegistry._isAvailable(tool, session) ? tool : null;
    }

    getMaxCalls(name) {
        return this.tools.get(name)?.constructor.maxCalls ?? Infinity;
    }

    createStep(name, args, session) {
        const tool = this.get(name, session);

        if (tool === null) {
            return { phase: AIPhases.thinking, emoji: AIToolRegistry.unknownToolEmoji, status: `Calling ${name}` };
        }

        return tool.createStep(args);
    }

    async execute(name, args, session) {
        const tool = this.get(name, session);

        if (tool === null) {
            return { error: `Unknown tool "${name}".` };
        }

        return await tool.execute(args, session);
    }

    static _isAvailable(tool, session) {
        return (session.toolPolicy?.allows(tool.name) ?? true) && tool.isAvailable(session);
    }
}

export default AIToolRegistry;
