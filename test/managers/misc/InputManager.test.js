import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let InputManager;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    ({ default: InputManager } = await import("../../../src/managers/misc/InputManager.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("InputManager", () => {
    test("processes multiline input and exit commands", async () => {
        const manager = new InputManager(true, ">", {
            handleInput: vi.fn(),
            onExit: vi.fn()
        });

        manager._active = true;
        manager.loopRunning = true;
        manager._readLine = vi.fn().mockResolvedValueOnce("second\\").mockResolvedValueOnce("third");

        expect(manager._processLine("hello\\")).toEqual(["hello", true]);
        expect(await manager._readMultilineInput("first")).toBe("first\nsecond\nthird");

        manager.unload = vi.fn();
        await manager._handleInput("exit");
        expect(manager.unload).toHaveBeenCalled();

        await manager._handleInput("");
        await manager._handleInput("run");
        expect(manager.handleInput).toHaveBeenCalledWith("run");
    });

    test("toggles activity, sets up and tears down loops, and logs handler failures", async () => {
        const onExit = vi.fn();
        const manager = new InputManager(true, ">", {
            handleInput: vi.fn().mockRejectedValue(new Error("boom")),
            onExit
        });

        manager._setupReadline = vi.fn(() => {
            manager._aborter = { abort: vi.fn(), signal: {} };
            manager.rl = { close: vi.fn() };
        });
        manager._runInputLoop = vi.fn();

        manager._active = false;
        manager.active = true;
        expect(manager._setupReadline).toHaveBeenCalled();
        expect(manager.loopRunning).toBe(true);

        manager.loopRunning = true;
        manager._aborter = { abort: vi.fn(), signal: {} };
        manager.rl = {
            close: vi.fn(),
            question: vi.fn().mockRejectedValue(new Error("aborted"))
        };

        await expect(manager._readLine("> ")).resolves.toBeUndefined();

        const loggerSpy = vi.spyOn(runtime.client.logger, "error");
        await manager._handleInput("run");
        expect(loggerSpy).toHaveBeenCalled();

        await manager.unload();
        expect(onExit).toHaveBeenCalled();
        expect(manager.rl).toBeNull();
        expect(manager._aborter).toBeNull();
    });
});
