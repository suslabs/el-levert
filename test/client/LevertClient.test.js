import { describe, expect, test, vi } from "vitest";

import { LevertClient } from "../../src/LevertClient.js";

function createClient() {
    return Object.assign(Object.create(LevertClient.prototype), {
        _lifecycle: {
            startLock: false,
            stopLock: false,
            restartLock: false
        },
        _started: false,
        _startedAt: -1,
        _startBot: vi.fn(),
        _stopBot: vi.fn(),
        _restartBot: vi.fn()
    });
}

describe("LevertClient", () => {
    test("lifecycle calls noop when already locked or in the wrong state", async () => {
        const client = createClient();

        client._lifecycle.startLock = true;

        await expect(client.start()).resolves.toBeUndefined();
        expect(client._startBot).not.toHaveBeenCalled();

        await expect(client.stop()).resolves.toBeUndefined();
        expect(client._stopBot).not.toHaveBeenCalled();

        await expect(client.restart()).resolves.toBeUndefined();
        expect(client._restartBot).not.toHaveBeenCalled();
    });
});
