import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addAdmin,
    addTag,
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
    msg = createCommandMessage("%tag edit");
    await addTag(runtime, "alpha", "body", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag edit command", () => {
    test("edits tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "edit alpha new body", { msg })).resolves.toContain("Edited tag");
        expect((await runtime.client.tagManager.fetch("alpha")).body).toBe("new body");
    });

    test("adds a warning for Discord-hosted media URLs", async () => {
        const command = getCommand(runtime, "tag"),
            url = "https://media.discordapp.net/attachments/1/2/file.png";

        await expect(executeCommand(command, `edit alpha ${url}`, { msg })).resolves.toBe(
            `:white_check_mark: Edited tag **alpha**.\n${command.attachmentWarning}`
        );
    });

    test("lets admins edit tags from file paths", async () => {
        const command = getCommand(runtime, "tag"),
            filePath = path.join(runtime.tempDir, "alpha.ts");

        await fs.writeFile(filePath, "const value: number = 1;\nreturn value;");
        await addAdmin(runtime, msg.author.id);

        await expect(executeCommand(command, `edit alpha ${filePath}`, { msg })).resolves.toContain(
            "Edited script tag"
        );

        const alpha = await runtime.client.tagManager.fetch("alpha");

        expect(alpha.body).toBe("const value: number = 1;\nreturn value;");
        expect(alpha.getScriptType()).toBe("ivm");
        expect(alpha.getScriptLanguage()).toBe("ts");
    });
});
