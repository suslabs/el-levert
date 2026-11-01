import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
    vi.restoreAllMocks();
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

    test("does not add warning when attachment is downloaded into the body", async () => {
        const command = getCommand(runtime, "tag");

        const attachMsg = createCommandMessage("%tag add beta", {
            author: msg.author,
            attachments: [{ url: "https://example.com/file.txt", contentType: "text/plain" }]
        });

        vi.spyOn(runtime.client.tagManager, "downloadBody").mockResolvedValueOnce({
            body: "downloaded content",
            isScript: false,
            isBinary: false,
            isFile: true
        });

        const res = await executeCommand(command, "add beta", { msg: attachMsg });

        expect(res).toContain("Created tag **beta**");
        expect(res).not.toContain(command.attachmentWarning);
    });

    test("adds warning when attachment is not covered by downloading the body", async () => {
        const command = getCommand(runtime, "tag");

        const attachMsg = createCommandMessage("%tag add gamma", {
            author: msg.author,
            attachments: [{ url: "https://cdn.discordapp.com/attachments/1/2/image.png", contentType: "image/png" }]
        });

        vi.spyOn(runtime.client.tagManager, "downloadBody").mockResolvedValueOnce({
            body: "https://cdn.discordapp.com/attachments/1/2/image.png",
            isScript: false,
            isBinary: false,
            isFile: false
        });

        const res = await executeCommand(command, "add gamma", { msg: attachMsg });

        expect(res).toContain("Created tag **gamma**");
        expect(res).toContain(command.attachmentWarning);
    });

    test("lets the bot owner create tags from file paths, but treats paths literally for admins and regular users", async () => {
        const command = getCommand(runtime, "tag"),
            filePath = path.join(runtime.tempDir, "alpha.js");

        await fs.writeFile(filePath, "return 7;");

        const ownerMsg = createCommandMessage(`%tag add alpha ${filePath}`, {
            author: {
                id: runtime.client.owner,
                username: "owner"
            }
        });

        const ownerRes = await executeCommand(command, `add alpha ${filePath}`, { msg: ownerMsg });
        expect(ownerRes).toContain("Created script tag **alpha**");
        expect(ownerRes).toContain(command.localFileWarning);

        const alpha = await runtime.client.tagManager.fetch("alpha");

        expect(alpha.body).toBe("return 7;");
        expect(alpha.getScriptType()).toBe("ivm");
        expect(alpha.getScriptLanguage()).toBe("js");

        await addAdmin(runtime, msg.author.id);

        const adminRes = await executeCommand(command, `add beta ${filePath}`, { msg });
        expect(adminRes).toContain("Created tag **beta**");
        expect(adminRes).not.toContain(command.localFileWarning);

        const beta = await runtime.client.tagManager.fetch("beta");
        expect(beta.body).toBe(filePath);
        expect(beta.getScriptType()).toBe("text");
    });
});
