import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });
    runtime.client.reactionDispatcher = {
        processAdd: vi.fn()
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("messageReactionAdd event", () => {
    test("passes reactions to the real client reaction dispatcher", async () => {
        const event = (await import("../../src/events/messageReactionAdd.js")).default,
            reaction = { emoji: { name: "1️⃣" } },
            user = { id: "1" };

        await event.listener(reaction, user);
        expect(runtime.client.reactionDispatcher.processAdd).toHaveBeenCalledWith(reaction, user);
    });
});
