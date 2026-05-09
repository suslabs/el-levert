import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("error event", () => {
    test("logs discord client errors through the real logger", async () => {
        const event = (await import("../../src/events/error.js")).default;
        const errorSpy = vi.spyOn(runtime.client.logger, "error").mockImplementation(() => runtime.client.logger);
        const err = new Error("boom");

        await event.listener(err);
        expect(errorSpy).toHaveBeenCalledWith("Discord client error:", err);
    });
});
