import { describe, expect, test, vi } from "vitest";

describe("index entrypoint", () => {
    test("loads globals and calls the real init path", async () => {
        vi.resetModules();

        const { LevertClient } = await import("../src/LevertClient.js");
        const startSpy = vi.spyOn(LevertClient.prototype, "start").mockResolvedValue(undefined);

        await import("../index.js");
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(globalThis.projRoot).toBeTypeOf("string");
        expect(startSpy).toHaveBeenCalledOnce();
    });
});
