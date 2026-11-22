import { describe, expect, test } from "vitest";

import AITool from "../../../src/ai/tools/AITool.js";

import AIPhases from "../../../src/structures/ai/AIPhases.js";

import Util from "../../../src/util/Util.js";

import AIError from "../../../src/errors/AIError.js";

const info = { name: "test_tool", phase: AIPhases.running, description: "Test tool." };

class EchoTool extends AITool {
    static info = info;

    getStatus(args) {
        return `Echoing ${this.formatArg(args.text)}`;
    }

    async execute(args) {
        if (args.text === "fail") {
            throw new AIError("Expected failure");
        } else if (args.text === "crash") {
            throw new TypeError("Unexpected failure");
        }

        return { text: args.text };
    }
}

class GatedTool extends EchoTool {
    isAvailable(session) {
        return session.allowed;
    }
}

const manager = { maxToolOutput: 4000 };

function createSession() {
    const logged = [];
    return { logged, allowed: false, logError: (name, err) => logged.push([name, err.message]) };
}

describe("AITool", () => {
    test("requires info, a valid phase and the child hooks", () => {
        class NoInfo extends AITool {}
        class BadPhase extends EchoTool {
            static info = { ...info, phase: "nope" };
        }
        class NoStatus extends AITool {
            static info = info;
            async execute() {}
        }

        expect(() => new NoInfo(manager)).toThrow("Tool must have info");
        expect(() => new BadPhase(manager)).toThrow("Tool must have a valid phase");
        expect(() => new NoStatus(manager)).toThrow("Child class must have a getStatus function");
    });

    test("wraps execute with error handling and output limits", async () => {
        const tool = new EchoTool(manager),
            session = createSession();

        await expect(tool.execute({ text: "hi" }, session)).resolves.toEqual({ text: "hi" });
        await expect(tool.execute({ text: "fail" }, session)).resolves.toEqual({ error: "Expected failure" });
        await expect(tool.execute({ text: "crash" }, session)).resolves.toEqual({ error: "Unexpected failure" });

        expect(session.logged).toEqual([["test_tool", "Unexpected failure"]]);

        const long = await tool.execute({ text: "x".repeat(10000) }, session);

        expect(long.truncated).toBe(true);
        expect(long.partial).toHaveLength(manager.maxToolOutput);
    });

    test("tools are available unless their isAvailable hook says otherwise", () => {
        const session = createSession();

        expect(new EchoTool(manager).isAvailable(session)).toBe(true);
        expect(new GatedTool(manager).isAvailable(session)).toBe(false);

        session.allowed = true;
        expect(new GatedTool(manager).isAvailable(session)).toBe(true);
    });

    test("creates status steps with trimmed single-line arguments", () => {
        const step = new EchoTool(manager).createStep({ text: `a\nb${"c".repeat(100)}` });

        expect(step.phase).toBe(AIPhases.running);
        expect(step.status).toBe(`Echoing ${Util.trimString(`a b${"c".repeat(100)}`, AITool.maxStatusArgLength)}`);
    });
});
