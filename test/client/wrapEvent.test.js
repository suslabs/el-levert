import { afterEach, describe, expect, test, vi } from "vitest";

import wrapEvent from "../../src/client/wrapEvent.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("wrapEvent", () => {
    test("returns sync values and logs thrown errors", () => {
        const logger = { error: vi.fn() };
        const wrapped = wrapEvent(logger, value => value.toUpperCase());

        expect(wrapped("ok")).toBe("OK");

        const failing = wrapEvent(logger, () => {
            throw new Error("boom");
        });

        expect(failing("ignored")).toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith("Event exception:", expect.any(Error));
    });

    test("catches rejected promises", async () => {
        const logger = { error: vi.fn() };
        const wrapped = wrapEvent(logger, async () => {
            throw new Error("async boom");
        });

        await expect(wrapped()).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith("Event exception:", expect.any(Error));
    });
});
