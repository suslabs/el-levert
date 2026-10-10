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
    runtime = await createCommandRuntime({
        loadHandlers: true
    });
    await addAdmin(runtime);

    runtime.client.commandHandler.outCharLimit = 5000;
    msg = createCommandMessage("%tag info", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
    await addTag(runtime, "alpha", "body", "user-1");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag info command", () => {
    test("returns tag info in default mode as embed", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "info alpha", { msg });

        expect(out.content).toContain("Tag info for **alpha**");
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.title).toBeUndefined();
        expect(out.embeds[0].data.description).toContain("**Owner**: name-user-1 (`user-1`)");
        expect(out.embeds[0].data.description).toContain("**Type**: `text`");
        expect(out.embeds[0].data.description).toContain("**Version**: `new`");
        expect(out.embeds[0].data.description).toContain("**Type int**: `1`");
    });

    test("returns tag info in default mode as plain text when discord is false", async () => {
        const command = getCommand(runtime, "tag");
        const out = await command.execute(
            command.createContext({
                commandName: "tag",
                raw: "%tag info alpha",
                rawContent: "info alpha",
                argsText: "info alpha",
                msg,
                author: msg.author,
                channel: msg.channel,
                discord: false,
                handler: null,
                parseResult: {
                    raw: "info alpha",
                    content: "info alpha",
                    name: "tag",
                    argsText: "info alpha"
                }
            })
        );

        expect(typeof out).toBe("string");
        expect(out).toContain("Tag info for **alpha**");
        expect(out).toContain("Owner: name-user-1 (user-1)");
        expect(out).toContain("Type: text");
        expect(out).toContain("Version: new");
        expect(out).toContain("Type int: 1");
    });

    test("returns tag info in json mode", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "info alpha json", { msg });

        expect(out).toContain("Tag info for **alpha**");
        expect(out).toContain('"name": "alpha"');
        expect(out).toContain('"typeInt": 1');
    });

    test("returns tag info in raw mode", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "info alpha raw", { msg });

        expect(out).toContain("Tag info for **alpha**");
        expect(out).toContain('"name": "alpha"');
        expect(out).toContain('"body": "body"');
    });

    test("rejects invalid info mode", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "info alpha invalid_mode", { msg });

        expect(out).toContain("Invalid info mode: `invalid_mode`");
    });
});
