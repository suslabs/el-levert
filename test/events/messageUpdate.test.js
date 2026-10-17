import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });
    runtime.client.messageDispatcher = {
        processEdit: vi.fn()
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("messageUpdate event", () => {
    test("passes updated messages to the real client message dispatcher", async () => {
        const event = (await import("../../src/events/messageUpdate.js")).default;
        const oldMsg = { id: "1", content: "old" },
            newMsg = { id: "1", content: "new" };

        await event.listener(oldMsg, newMsg);
        expect(runtime.client.messageDispatcher.processEdit).toHaveBeenCalledWith(oldMsg, newMsg);
    });
});
