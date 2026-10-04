import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addAdmin,
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
        ).resolves.toContain("Created script tag **typed**");
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

    test("adds a warning for Discord-hosted media URLs", async () => {
        const command = getCommand(runtime, "tag"),
            url = "https://cdn.discordapp.com/attachments/1/2/file.png";

        await expect(executeCommand(command, `add alpha ${url}`, { msg })).resolves.toBe(
            `:white_check_mark: Created tag **alpha**.\n${command.attachmentWarning}`
        );
    });

    test("lets admins create tags from file paths", async () => {
        const command = getCommand(runtime, "tag"),
            filePath = path.join(runtime.tempDir, "alpha.js");

        await fs.writeFile(filePath, "return 7;");
        await addAdmin(runtime, msg.author.id);

        await expect(executeCommand(command, `add alpha ${filePath}`, { msg })).resolves.toContain(
            "Created script tag **alpha**"
        );

        const alpha = await runtime.client.tagManager.fetch("alpha");

        expect(alpha.body).toBe("return 7;");
        expect(alpha.getScriptType()).toBe("ivm");
        expect(alpha.getScriptLanguage()).toBe("js");
    });
});
