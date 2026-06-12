import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag add alpha body", {
        author: {
            id: "user-1",
            username: "alex"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag add command", () => {
    test("creates tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "add alpha body", { msg })).resolves.toContain("Created tag **alpha**");
        expect(await runtime.client.tagManager.fetch("alpha")).toMatchObject({
            name: "alpha",
            body: "body"
        });

        await expect(
            executeCommand(command, "add typed ```ts\nconst value: number = 1;\n```", { msg })
        ).resolves.toContain("Created tag **typed**");
        const typed = await runtime.client.tagManager.fetch("typed");
        expect(typed.getScriptType()).toBe("ivm");
        expect(typed.getScriptLanguage()).toBe("ts");

        await expect(
            executeCommand(command, "add literal ts ```ts\nconst value: number = 1;\n```", { msg })
        ).resolves.toContain("Created tag **literal**");
        const literal = await runtime.client.tagManager.fetch("literal");
        expect(literal.getScriptType()).toBe("text");
        expect(literal.getScriptLanguage()).toBeUndefined();
    });
});
