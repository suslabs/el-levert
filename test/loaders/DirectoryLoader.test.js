import fs from "node:fs/promises";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "../../setupGlobals.js";
import DirectoryLoader from "../../src/loaders/DirectoryLoader.js";
import Loader from "../../src/loaders/Loader.js";
import LoadStatus from "../../src/loaders/LoadStatus.js";

class DummyFileLoader extends Loader {
    constructor(nameOrPath, filePathOrLogger, loggerOrOptions, maybeOptions) {
        const hasExplicitName = typeof maybeOptions !== "undefined";
        const name = hasExplicitName ? nameOrPath : "file";
        const filePath = hasExplicitName ? filePathOrLogger : nameOrPath;
        const logger = hasExplicitName ? loggerOrOptions : filePathOrLogger;
        const options = hasExplicitName ? maybeOptions : (loggerOrOptions ?? {});

        super(name, logger, options);
        this.path = filePath;
    }

    load() {
        this.data = path.parse(this.path).name;
        return LoadStatus.successful;
    }

    write(data) {
        this.data = data;
        return LoadStatus.successful;
    }
}

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-dir-loader-"));
    await fs.mkdir(path.join(tempDir, "nested"));
    await fs.writeFile(path.join(tempDir, "alpha.txt"), "alpha");
    await fs.writeFile(path.join(tempDir, "nested", "beta.txt"), "beta");
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("DirectoryLoader", () => {
    test("lists files recursively and loads matching file types", () => {
        const files = DirectoryLoader.listFilesRecursiveSync(tempDir);
        expect(files).toHaveLength(2);

        const logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            log: () => {}
        };
        const loader = new DirectoryLoader("text", tempDir, logger, {
            sync: true,
            fileExtension: ".txt",
            fileLoaderClass: DummyFileLoader
        });

        expect(loader.load()).toEqual([expect.any(Map), LoadStatus.successful]);
        expect(loader.files).toHaveLength(2);
        expect(loader.getPath("alpha")).toContain("alpha.txt");
        expect(loader.deleteData("alpha")).toBe(true);
    });
});

describe("Merged Branch Coverage", () => {
    class BranchFileLoader extends Loader {
        constructor(nameOrPath, filePathOrLogger, loggerOrOptions, maybeOptions) {
            const hasExplicitName = typeof maybeOptions !== "undefined";
            const name = hasExplicitName ? nameOrPath : "file";
            const filePath = hasExplicitName ? filePathOrLogger : nameOrPath;
            const logger = hasExplicitName ? loggerOrOptions : filePathOrLogger;
            const options = hasExplicitName ? maybeOptions : (loggerOrOptions ?? {});

            super(name, logger, options);
            this.path = filePath;
        }

        load() {
            const finish = status => (this.options.sync ? status : Promise.resolve(status));

            if (this.path.includes("failed")) {
                return finish(LoadStatus.failed);
            }

            if (this.path.includes("throws")) {
                throw new Error("load exploded");
            }

            this.data = path.parse(this.path).name;
            return finish(LoadStatus.successful);
        }

        write(data) {
            const finish = status => (this.options.sync ? status : Promise.resolve(status));

            if (this.path.includes("write-failed")) {
                return finish(LoadStatus.failed);
            }

            if (this.path.includes("write-throws")) {
                throw new Error("write exploded");
            }

            this.data = data;
            return finish(LoadStatus.successful);
        }
    }

    let tempDir;

    function createLogger() {
        return {
            debug: vi.fn(),
            info: vi.fn(),
            log: vi.fn(),
            warn: vi.fn()
        };
    }

    beforeEach(async () => {
        tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "el-levert-dir-loader-branches-"));

        await fsPromises.mkdir(path.join(tempDir, "nested", "deep"), { recursive: true });
        await fsPromises.mkdir(path.join(tempDir, "skip"), { recursive: true });

        await fsPromises.writeFile(path.join(tempDir, "alpha.txt"), "alpha");
        await fsPromises.writeFile(path.join(tempDir, "failed.txt"), "failed");
        await fsPromises.writeFile(path.join(tempDir, "throws.js"), "throws");
        await fsPromises.writeFile(path.join(tempDir, "nested", "beta.txt"), "beta");
        await fsPromises.writeFile(path.join(tempDir, "nested", "deep", "gamma.js"), "gamma");
        await fsPromises.writeFile(path.join(tempDir, "skip", "ignored.txt"), "ignored");
    });

    afterEach(async () => {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
    });

    describe("DirectoryLoader branch coverage", () => {
        test("covers recursive listing callbacks and partial load results", async () => {
            const visited = [];
            const files = await DirectoryLoader.listFilesRecursiveAsync(tempDir, 2, async (itemPath, type) => {
                visited.push([path.basename(itemPath), type]);
            });

            expect(files).toEqual(
                expect.arrayContaining([
                    path.join(tempDir, "alpha.txt"),
                    path.join(tempDir, "failed.txt"),
                    path.join(tempDir, "throws.js"),
                    path.join(tempDir, "nested", "beta.txt")
                ])
            );
            expect(visited).toEqual(
                expect.arrayContaining([
                    ["nested", "directory"],
                    ["alpha.txt", "file"]
                ])
            );

            const logger = createLogger();
            const loader = new DirectoryLoader("text", tempDir, logger, {
                sync: false,
                throwOnFailure: false,
                excludeDirs: [path.join(tempDir, "skip")],
                fileExtension: ".txt",
                fileLoaderClass: BranchFileLoader
            });

            await expect(loader.load()).resolves.toEqual([expect.any(Map), LoadStatus.successful]);
            expect(loader.result).toEqual({
                ok: 2,
                bad: 1,
                total: 3
            });
            expect(loader.files.some(file => file.includes("ignored.txt"))).toBe(false);
        });

        test("covers path validation, empty writes, missing loaders, and delete-data edge cases", () => {
            const logger = createLogger();
            const invalidLoader = new DirectoryLoader("text", undefined, logger, {
                sync: true,
                throwOnFailure: false
            });

            expect(invalidLoader.load()).toEqual([null, LoadStatus.failed]);
            expect(invalidLoader.write({})).toBe(LoadStatus.failed);

            const loader = new DirectoryLoader("text", tempDir, logger, {
                sync: true,
                throwOnFailure: false,
                fileLoaderClass: BranchFileLoader
            });

            loader.loaded = true;
            loader.loaders = new Map();
            loader.data = new Map();

            expect(loader.write({ "missing.txt": "alpha" })).toBe(LoadStatus.failed);
            expect(logger.warn).toHaveBeenCalledWith("Can't write missing.txt: text isn't loaded.");

            expect(loader.getLoader({}, true)).toBe(LoadStatus.failed);
            expect(loader.getPath({}, true)).toBe(LoadStatus.failed);

            loader.loaders.set("alpha.txt", {
                path: "alpha.txt",
                getData: () => "alpha"
            });
            loader.data.set("alpha.txt", "alpha");

            expect(loader.deleteData("alpha", true)).toBe(LoadStatus.successful);
            expect(loader.deleteData("alpha", true)).toBe(LoadStatus.failed);

            loader.data = ["beta"];
            loader.loaders.set("beta.txt", {
                path: "beta.txt",
                getData: () => "beta"
            });
            expect(loader.getPath("beta")).toBe("beta.txt");

            const syncThrowLoader = new DirectoryLoader("text", tempDir, logger, {
                sync: true,
                throwOnFailure: false,
                fileExtension: ".js",
                fileLoaderClass: BranchFileLoader
            });

            expect(syncThrowLoader.load()).toEqual([expect.any(Map), LoadStatus.successful]);
            expect(syncThrowLoader.result).toEqual({
                ok: 1,
                bad: 1,
                total: 2
            });
        });
    });
});
