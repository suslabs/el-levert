import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;
let Handler;
let ExampleHandler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        config: {
            minResponseTime: 20,
            globalTimeLimit: 40
        }
    });

    ({ default: Handler } = await import("../../src/handlers/Handler.js"));
    ExampleHandler = class ExampleHandler extends Handler {
        static $name = "exampleHandler";

        load() {
            return "loaded";
        }

        unload() {
            return "unloaded";
        }

        execute(value) {
            return value;
        }

        delete() {
            return true;
        }
    };
});

afterEach(async () => {
    vi.useRealTimers();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("Handler", () => {
    test("validates names and wraps lifecycle methods", async () => {
        expect(
            () =>
                new (class extends Handler {
                    execute() {}
                })()
        ).toThrow("must have a name");

        const handler = new ExampleHandler(true);
        expect(handler.load()).toBe("loaded");
        expect(handler.unload()).toBe("unloaded");
        expect(handler.execute("ok")).toBe("ok");
        expect(handler.delete()).toBe(true);
        expect(await handler.resubmit("ok")).toBe(1);
    });

    test("short-circuits disabled handlers and applies response delays", async () => {
        vi.useFakeTimers();

        const handler = new ExampleHandler(false, {
            minResponseTime: -1,
            globalTimeLimit: -1
        });
        expect(handler.execute("ignored")).toBe(false);
        expect(handler.delete()).toBe(false);

        const enabled = new ExampleHandler(true);

        const firstDelay = enabled._addDelay(Number.NaN);
        await vi.advanceTimersByTimeAsync(20);
        await firstDelay;

        const secondDelay = enabled._addDelay(5);
        await vi.advanceTimersByTimeAsync(15);
        await secondDelay;
    });
});
