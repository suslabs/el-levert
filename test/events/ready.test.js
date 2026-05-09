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

describe("ready event", () => {
    test("delegates to the real client onReady hook", async () => {
        const event = (await import("../../src/events/ready.js")).default;
        const readySpy = vi.spyOn(runtime.client, "onReady").mockImplementation(() => {});

        await event.listener();
        expect(readySpy).toHaveBeenCalledOnce();
    });
});
