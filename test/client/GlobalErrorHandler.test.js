import { afterEach, describe, expect, test, vi } from "vitest";

import { registerGlobalErrorHandler, removeGlobalErrorHandler } from "../../src/client/GlobalErrorHandler.js";

let globalHandlerRegistered = false;

afterEach(() => {
    if (globalHandlerRegistered) {
        removeGlobalErrorHandler();
        globalHandlerRegistered = false;
    }

    vi.restoreAllMocks();
});

describe("GlobalErrorHandler", () => {
    test("registers listeners, logs handled errors, and removes listeners again", () => {
        const logger = {
            error: vi.fn(),
            info: vi.fn()
        };

        registerGlobalErrorHandler(logger);
        globalHandlerRegistered = true;

        expect(logger.info).toHaveBeenCalledWith("Registered global error handler.");

        process.emit("unhandledRejection", "reason", Promise.resolve());
        process.emit("uncaughtException", new Error("boom"));

        expect(logger.error).toHaveBeenCalledWith("Unhandled promise rejection:", "reason");
        expect(logger.error).toHaveBeenCalledWith("Uncaught exception:", expect.any(Error));

        removeGlobalErrorHandler();
        globalHandlerRegistered = false;

        expect(logger.info).toHaveBeenLastCalledWith("Removed global error handler.");
    });

    test("falls back to console logging when reporting an uncaught exception fails", () => {
        const logger = {
            error: vi.fn(() => {
                throw new Error("logger failed");
            }),
            info: vi.fn()
        };
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const exceptionCount = process.listeners("uncaughtException").length;

        registerGlobalErrorHandler(logger);
        globalHandlerRegistered = true;

        const exceptionListener = process.listeners("uncaughtException")[exceptionCount];
        exceptionListener(new Error("boom"));

        expect(consoleSpy).toHaveBeenCalled();
    });
});
