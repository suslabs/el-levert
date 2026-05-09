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

describe("owner restart command", () => {
    test("delegates to restart and rebinds the message channel", async () => {
        const command = getCommand(runtime, "restart");
        const channel = {
            id: "channel-1",
            name: "general"
        };

        runtime.client.client.channels.cache.set(channel.id, channel);

        const restartSpy = vi.spyOn(runtime.client, "restart").mockImplementation(async callback => {
            const configs = await callback();
            expect(configs).toHaveProperty("config");
            return 12.34;
        });

        const msg = createCommandMessage("%restart", {
            author: {
                id: "owner-id",
                username: "owner"
            },
            channel: {
                id: "channel-1",
                name: "old"
            }
        });

        const out = await executeCommand(command, "", { msg });

        expect(restartSpy).toHaveBeenCalledOnce();
        expect(out).toContain("Restarted bot in **12.34 ms**");
        expect(msg.channel).toBe(channel);
    });
});
