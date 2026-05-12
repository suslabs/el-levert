import { describe, expect, test, vi } from "vitest";
import Loader from "../../src/loaders/Loader.js";
import LoadStatus from "../../src/loaders/LoadStatus.js";

class TestLoader extends Loader {
    load() {}
}

describe("Loader", () => {
    test("throws when the configured data field is missing", () => {
        const loader = new TestLoader("test", null, { dataField: "missing" });

        expect(() => loader.getData()).toThrow("Data field not found");
        expect(loader.getData(false)).toBeNull();
    });
});

describe("Merged Branch Coverage", () => {
    class SyncLoader extends Loader {
        constructor(name, logger, options = {}) {
            super(name, logger, {
                type: "json_file",
                ...options
            });
        }

        load(status = LoadStatus.successful) {
            this.data = {
                status
            };

            return status;
        }

        write(data, status = LoadStatus.successful) {
            return status;
        }

        dispose() {
            return "disposed";
        }
    }

    class AsyncLoader extends SyncLoader {
        async load(status = LoadStatus.successful) {
            this.data = {
                status
            };

            return status;
        }

        async write(data, status = LoadStatus.successful) {
            return status;
        }
    }

    describe("Loader branches", () => {
        test("validates child classes and formats names and data lookups", () => {
            expect(() => new Loader("broken")).toThrow("Child class must have a load function");

            const loader = new SyncLoader("config", null);
            loader.data = {
                ok: true
            };

            expect(loader.getName()).toBe("config json file");
            expect(loader.getName(true)).toBe("Config json file");
            expect(loader.getPluralName()).toBe("configs");
            expect(new SyncLoader("", null).getPluralName()).toBe("");
            expect(loader.getData()).toEqual({
                ok: true
            });
            expect(() => new SyncLoader("config", null, { dataField: "missing" }).getData()).toThrow("Data field not found");
        });

        test("handles failure modes with thrown errors and logger fallback", () => {
            const logger = {
                log: vi.fn()
            };

            const throwingLoader = new SyncLoader("config", logger);
            expect(() => throwingLoader.failure("Failed badly.")).toThrow("Failed badly");

            const silentLoader = new SyncLoader("config", logger, {
                throwOnFailure: false
            });

            expect(silentLoader.failure("Failed softly.")).toBe(LoadStatus.failed);
            expect(logger.log).toHaveBeenCalledWith("error", expect.objectContaining({
                message: "Failed softly"
            }));

            const err = new Error("boom");
            expect(silentLoader.failure(err, "While loading", "warn")).toBe(LoadStatus.failed);
            expect(logger.log).toHaveBeenLastCalledWith("warn", "While loading", err);
        });

        test("covers synchronous and asynchronous load paths, including ignored and failed states", async () => {
            const logger = {
                debug: vi.fn(),
                log: vi.fn()
            };

            const syncLoader = new SyncLoader("config", logger);
            expect(syncLoader.result).toEqual({});

            expect(syncLoader.load()).toEqual([
                {
                    status: LoadStatus.successful
                },
                LoadStatus.successful
            ]);
            expect(syncLoader.loaded).toBe(true);
            expect(logger.debug).toHaveBeenCalledWith("Loading config json file...");
            expect(logger.log).toHaveBeenCalledWith("info", "Loaded config json file successfully.");

            const ignoredLoader = new SyncLoader("config", logger);
            ignoredLoader.getIgnoredMessage = () => "Ignored on purpose.";
            expect(ignoredLoader.load(LoadStatus.ignore)).toEqual([
                {
                    status: LoadStatus.ignore
                },
                LoadStatus.ignore
            ]);
            expect(logger.log).toHaveBeenCalledWith("debug", "Ignored on purpose.");

            const failedLoader = new SyncLoader("config", logger);
            expect(failedLoader.load(LoadStatus.failed)).toEqual([null, LoadStatus.failed]);

            const asyncLoader = new AsyncLoader("config", logger);
            asyncLoader.getLoadedMessage = () => "Loaded async.";
            await expect(asyncLoader.load()).resolves.toEqual([
                {
                    status: LoadStatus.successful
                },
                LoadStatus.successful
            ]);
            expect(logger.log).toHaveBeenCalledWith("info", "Loaded async.");
        });

        test("covers write, dispose, and null-data edge cases", async () => {
            const logger = {
                debug: vi.fn(),
                log: vi.fn()
            };

            const syncLoader = new SyncLoader("config", logger);
            syncLoader.data = {
                existing: true
            };

            expect(syncLoader.write(undefined, LoadStatus.successful)).toBe(LoadStatus.successful);
            expect(logger.log).toHaveBeenCalledWith("info", "Wrote config json file successfully.");

            const ignoredWriter = new SyncLoader("config", logger);
            ignoredWriter.getIgnoredMessage = () => "Skipped write.";
            expect(ignoredWriter.write({
                ok: true
            }, LoadStatus.ignore)).toBe(LoadStatus.ignore);
            expect(logger.log).toHaveBeenCalledWith("debug", "Skipped write.");

            const failedWriter = new SyncLoader("config", logger);
            expect(failedWriter.write({
                ok: true
            }, LoadStatus.failed)).toBe(LoadStatus.failed);

            const asyncLoader = new AsyncLoader("config", logger);
            await expect(asyncLoader.write({
                async: true
            })).resolves.toBe(LoadStatus.successful);

            const nullWriter = new SyncLoader("config", logger, {
                throwOnFailure: false
            });
            nullWriter.data = null;
            expect(nullWriter.write()).toBe(LoadStatus.failed);

            expect(syncLoader.dispose()).toBe("disposed");

            class NoWriteLoader extends Loader {
                load() {
                    this.data = {
                        ok: true
                    };

                    return LoadStatus.successful;
                }
            }

            const noWriteLoader = new NoWriteLoader("noop", logger);
            expect(noWriteLoader.write()).toBe(LoadStatus.successful);
            expect(noWriteLoader.dispose()).toBeUndefined();
        });
    });
});
