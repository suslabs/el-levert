import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupRuntime(runtime);
});

describe("ping command", () => {
    test("replies with pinging text, then edits in measured latencies", async () => {
        const command = getCommand(runtime, "ping");
        const msg = createCommandMessage("%ping", {
            createdTimestamp: 1000
        });

        const sentMessage = {
            id: "reply-1",
            createdTimestamp: 1123
        };
        const handler = {
            contextReply: vi.fn(async () => sentMessage),
            editFromContext: vi.fn(async (_context, data) => data)
        };

        vi.spyOn(performance, "now").mockReturnValueOnce(2000).mockReturnValueOnce(2012);

        await expect(executeCommand(command, "", { msg, handler })).resolves.toBeUndefined();

        expect(handler.contextReply).toHaveBeenCalledWith(
            expect.objectContaining({
                msg
            }),
            ":information_source: Pinging...",
            {}
        );
        expect(handler.editFromContext).toHaveBeenCalledWith(
            expect.objectContaining({
                msg
            }),
            ":white_check_mark: Pong!\n**Total latency:** `123ms`\n**Server latency:** `12ms`",
            {}
        );
    });
});
