import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });
    runtime.client.messageProcessor = {
        processEdit: vi.fn()
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("messageUpdate event", () => {
    test("passes updated messages to the real client message processor", async () => {
        const event = (await import("../../src/events/messageUpdate.js")).default;
        const msg = { id: "1" };

        await event.listener({}, msg);
        expect(runtime.client.messageProcessor.processEdit).toHaveBeenCalledWith(msg);
    });
});
