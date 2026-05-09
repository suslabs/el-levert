import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "../../setupGlobals.js";
import LoadStatus from "../../src/loaders/LoadStatus.js";
import TextLoader from "../../src/loaders/TextLoader.js";
import WriteModes from "../../src/loaders/WriteModes.js";

let tempDir;
let filePath;

beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "el-levert-text-loader-"));
    filePath = path.join(tempDir, "sample.txt");
    await fsPromises.writeFile(filePath, "hello\n");
});

afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
});

describe("TextLoader", () => {
    test("loads, writes, and appends text content", async () => {
        const loader = new TextLoader("text", filePath, null, {
            sync: false
        });

        await expect(loader.load()).resolves.toEqual(["hello", LoadStatus.successful]);
        await expect(loader.write("world")).resolves.toBe(LoadStatus.successful);
        expect(await fsPromises.readFile(filePath, "utf8")).toBe("world");

        await expect(loader.write("!", WriteModes.append)).resolves.toBe(LoadStatus.successful);
        expect(await fsPromises.readFile(filePath, "utf8")).toBe("world!");
    });
});

describe("Merged Branch Coverage", () => {
    let tempDir;
    let filePath;

    function createLogger() {
        return {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn()
        };
    }

    beforeEach(async () => {
        tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "el-levert-text-loader-branches-"));
        filePath = path.join(tempDir, "sample.txt");
        await fsPromises.writeFile(filePath, "alpha\n");
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fsPromises.rm(tempDir, { recursive: true, force: true });
    });

    describe("TextLoader branch coverage", () => {
        test("covers sync append, missing files, and temp-path helpers", () => {
            const logger = createLogger();
            const loader = new TextLoader("text", filePath, logger, {
                sync: true,
                throwOnFailure: false
            });

            expect(loader.load()).toEqual(["alpha", LoadStatus.successful]);
            expect(loader.write("beta", WriteModes.append)).toBe(LoadStatus.successful);
            expect(fs.readFileSync(filePath, "utf8")).toBe("alphabeta");

            const missingLoader = new TextLoader("missing", path.join(tempDir, "missing.txt"), logger, {
                sync: true,
                throwOnFailure: false
            });

            expect(missingLoader.load()).toEqual([null, LoadStatus.failed]);
            expect(TextLoader._getTempPath("")).toBeNull();
        });

        test("covers delete-error branches for sync and async write failures", async () => {
            const logger = createLogger();
            const syncLoader = new TextLoader("text", filePath, logger, {
                sync: true,
                throwOnFailure: false
            });

            vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
                throw new Error("write failed");
            });
            vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
                const err = new Error("missing temp");
                err.code = "ENOENT";
                throw err;
            });

            expect(syncLoader.write("beta")).toBe(LoadStatus.failed);
            expect(logger.error).toHaveBeenCalledWith("Temp file for text text file not found.");

            const asyncLoader = new TextLoader("text", filePath, logger, {
                sync: false,
                throwOnFailure: false
            });

            vi.spyOn(fsPromises, "writeFile").mockRejectedValueOnce(new Error("async write failed"));
            vi.spyOn(fsPromises, "unlink").mockRejectedValueOnce(Object.assign(new Error("unlink failed"), { code: "EPERM" }));

            await expect(asyncLoader.write("gamma")).resolves.toBe(LoadStatus.failed);
            expect(logger.error).toHaveBeenCalledWith(
                "Error occured while deleting temp file for text text file:",
                expect.any(Error)
            );
        });
    });
});
