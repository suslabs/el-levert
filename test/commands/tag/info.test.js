import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addAdmin, addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

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
    test("returns tag info through the real tag structure", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "info alpha", { msg });

        expect(out).toContain("Tag info for **alpha**");
        expect(out).toContain('"name": "alpha"');
    });
});
