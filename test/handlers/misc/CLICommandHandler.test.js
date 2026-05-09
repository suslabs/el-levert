import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let CLICommandHandler;
let logSpy;
let errorSpy;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadVMs: false,
        config: {
            enableCliCommands: true,
            cliCmdPrefix: "!"
        }
    });

    ({ default: CLICommandHandler } = await import("../../../src/handlers/misc/CLICommandHandler.js"));

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("CLICommandHandler", () => {
    test("routes replies to console methods", () => {
        const handler = new CLICommandHandler(true);

        handler.reply("log", "hello");
        handler.reply("custom", "world");

        expect(logSpy).toHaveBeenCalledWith("hello");
        expect(logSpy).toHaveBeenCalledWith("custom", "world");
    });

    test("executes real commands, reports missing commands, and logs failures", async () => {
        const handler = new CLICommandHandler(true);

        await expect(handler.execute("noop")).resolves.toBeUndefined();

        await handler.execute("!missing");
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Command "missing" not found.'));

        await handler.execute("!version");
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(runtime.client.version));

        const loggerSpy = vi.spyOn(runtime.client.logger, "error");
        await handler.execute('!eval throw new Error("boom")');
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('Encountered exception while executing command "eval"')
        );
    });

    test("does not time out slow CLI commands", async () => {
        const handler = new CLICommandHandler(true);

        handler.globalTimeLimit = 10;

        const slowCommand = {
            name: "slow",
            execute: async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return "done";
            }
        };

        vi.spyOn(runtime.client.cliCommandManager, "isCommand").mockReturnValue(true);
        vi.spyOn(runtime.client.cliCommandManager, "getCommand").mockReturnValue([
            slowCommand,
            "slow",
            null,
            {
                content: "",
                argsText: ""
            }
        ]);

        await handler.execute("!slow");

        expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("Timed out executing command"));
        expect(logSpy).toHaveBeenCalledWith("done");
    });
});
