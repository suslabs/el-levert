import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });
    runtime.client.messageProcessor = {
        processCreate: vi.fn()
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("messageCreate event", () => {
    test("passes messages to the real client message processor", async () => {
        const event = (await import("../../src/events/messageCreate.js")).default;
        const msg = { id: "1" };

        await event.listener(msg);
        expect(runtime.client.messageProcessor.processCreate).toHaveBeenCalledWith(msg);
    });
});
