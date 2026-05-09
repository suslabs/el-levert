import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("owner stop command", () => {
    test("replies before delegating to stop", async () => {
        const command = getCommand(runtime, "stop");
        const stopSpy = vi.spyOn(runtime.client, "stop").mockResolvedValue(0);
        const handler = {
            contextReply: vi.fn(async (_context, data) => data)
        };
        const msg = createCommandMessage("%stop", {
            author: {
                id: "owner-id",
                username: "owner"
            }
        });

        await expect(executeCommand(command, "", { msg, handler })).resolves.toBeUndefined();
        expect(handler.contextReply).toHaveBeenCalledWith(
            expect.objectContaining({
                msg
            }),
            ":information_source: Stopping bot...",
            {}
        );
        expect(stopSpy).toHaveBeenCalledWith(true);
    });
});
