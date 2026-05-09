import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadHandlers: true
    });
    msg = createCommandMessage("%tag random");
    await addTag(runtime, "roll1", "dice one", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag random command", () => {
    test("executes the selected random tag through the real parent path", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "random roll", { msg });

        expect(out[0]).toBe("dice one");
    });
});
