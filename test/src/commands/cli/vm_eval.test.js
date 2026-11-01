import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    cleanupRuntime,
    createCommandRuntime,
    executeCliCommand,
    getCliCommand
} from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false,
        config: {
            enableCliCommands: true
        }
    });

    runtime.client.tagVM = {
        runScript: vi.fn((code, values) => ({
            code,
            embed: values.msg.embeds[0]?.data.description ?? null,
            msgId: values.msg.id,
            everyone: values.msg.mentions?.everyone ?? false,
            reactCount: values.msg.reactions?.length ?? 0,
            url: values.msg.attachments.first()?.url ?? null
        }))
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("cli vm_eval command", () => {
    test("passes emulated message data into vm eval", async () => {
        const command = getCliCommand(runtime, "vm_eval");

        await expect(
            executeCliCommand(
                command,
                `1 + 1 --msg-id 712345678901234567 --author-id 222 --guild-id 333 --channel-id 444 --msg-attachments '["https://example.com/code.js"]' --msg-embeds '[{"description":"eval embed"}]' --msg-reactions '[{"emoji":{"name":"🔥"}}]' --msg-mentions '{"everyone":true}'`
            )
        ).resolves.toEqual({
            code: "1 + 1",
            embed: "eval embed",
            everyone: true,
            msgId: "712345678901234567",
            reactCount: 1,
            url: "https://example.com/code.js"
        });
    });

    test("loads vm eval code from an absolute file path", async () => {
        const command = getCliCommand(runtime, "vm_eval"),
            filePath = path.join(runtime.tempDir, "vm-eval.js");

        await fs.writeFile(filePath, "return 42;");

        await expect(executeCliCommand(command, filePath)).resolves.toMatchObject({
            code: "return 42;"
        });
    });
});
