import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    addTag,
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

    runtime.client.checkComponent = vi.fn(() => ({
        runScript: vi.fn((body, values) => ({
            args: values.args,
            body,
            embed: values.msg.embeds[0]?.data.description ?? null,
            msgId: values.msg.id,
            everyone: values.msg.mentions?.everyone ?? false,
            reactCount: values.msg.reactions?.length ?? 0,
            owner: values.tag.owner,
            tag: values.tag.name,
            url: values.msg.attachments.first()?.url ?? null
        }))
    }));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("cli execute_tag command", () => {
    test("executes real tags with emulated message properties", async () => {
        const command = getCliCommand(runtime, "execute_tag");

        await addTag(runtime, "alpha", "return args", "owner-id", { type: "ivm" });

        await expect(
            executeCliCommand(
                command,
                `alpha hi there --msg-id 712345678901234567 --author-id 222 --guild-id 333 --channel-id 444 --msg-attachments '["https://example.com/a.txt"]' --msg-embeds '[{"description":"embed body"}]' --msg-reactions '[{"emoji":{"name":"🔥"}}]' --msg-mentions '{"everyone":true}'`
            )
        ).resolves.toEqual({
            args: "hi there",
            body: "return args",
            embed: "embed body",
            everyone: true,
            msgId: "712345678901234567",
            owner: "owner-id",
            reactCount: 1,
            tag: "alpha",
            url: "https://example.com/a.txt"
        });
    });

    test("executes emulated tags through the normal tag manager path", async () => {
        const command = getCliCommand(runtime, "execute_tag");

        await expect(
            executeCliCommand(
                command,
                `payload data --tag-type ivm --tag-body 'return args' --tag-owner owner-id --tag-name faux --msg-reactions '[{"emoji":{"name":"🔥"}}]' --msg-mentions '{"everyone":false}'`
            )
        ).resolves.toEqual({
            args: "payload data",
            body: "return args",
            embed: null,
            msgId: expect.any(String),
            everyone: false,
            owner: "owner-id",
            reactCount: 1,
            tag: "faux",
            url: null
        });
    });

    test("loads emulated tag bodies from absolute file paths", async () => {
        const command = getCliCommand(runtime, "execute_tag"),
            filePath = path.join(runtime.tempDir, "tag-body.js");

        await fs.writeFile(filePath, "return args.toUpperCase()");

        await expect(
            executeCliCommand(command, `payload data --tag-body "${filePath}" --tag-owner owner-id --tag-name faux`)
        ).resolves.toEqual({
            args: "payload data",
            body: "return args.toUpperCase()",
            embed: null,
            msgId: expect.any(String),
            everyone: false,
            owner: "owner-id",
            reactCount: 0,
            tag: "faux",
            url: null
        });
    });
});
