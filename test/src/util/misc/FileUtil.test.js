import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import "../../../../setupGlobals.js";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import FileUtil from "../../../../src/util/misc/FileUtil.js";

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-file-util-"));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("FileUtil", () => {
    test("resolves paths relative to projRoot and passes through non-string values", () => {
        const ref = { path: "kept" };

        expect(FileUtil.resolve()).toBe(path.resolve(projRoot));
        expect(FileUtil.resolve(undefined)).toBeUndefined();
        expect(FileUtil.resolve(null, "src", "util")).toBe(path.resolve(projRoot, "src", "util"));
        expect(FileUtil.resolve("src", "util")).toBe(path.resolve(projRoot, "src", "util"));
        expect(FileUtil.resolve(ref)).toBe(ref);
    });

    test("distinguishes absolute and relative path candidates", () => {
        const absPath = process.platform === "win32" ? "C:\\temp\\file.js" : "/tmp/file.js",
            relPath = process.platform === "win32" ? "folder\\file.js" : "folder/file.js";

        expect(FileUtil.looksLikeAbsolutePath(absPath)).toBe(true);
        expect(FileUtil.looksLikeAbsolutePath(pathToFileURL(absPath).href)).toBe(true);
        expect(FileUtil.looksLikeAbsolutePath(relPath)).toBe(false);

        expect(FileUtil.looksLikeRelativePath("./file.js")).toBe(true);
        expect(FileUtil.looksLikeRelativePath("../file.js")).toBe(true);
        expect(FileUtil.looksLikeRelativePath(relPath)).toBe(true);
        expect(FileUtil.looksLikeRelativePath("script.js")).toBe(true);
        expect(FileUtil.looksLikeRelativePath("hello world")).toBe(false);
        expect(FileUtil.looksLikeRelativePath("")).toBe(false);

        expect(FileUtil.looksLikePath(absPath)).toBe(true);
        expect(FileUtil.looksLikePath(relPath)).toBe(true);
    });

    test("turns local paths into file urls without changing existing file urls", () => {
        const relPath = "./src/util/Util.js",
            fileUrl = pathToFileURL(path.resolve(projRoot, relPath)).href;

        expect(FileUtil.toFileUrl(relPath)).toBe(fileUrl);
        expect(FileUtil.toFileUrl(fileUrl)).toBe(fileUrl);
    });

    test("extracts path names from file urls, paths, and plain specifiers", () => {
        const filePath = path.join(tempDir, "nested", "file.js"),
            fileUrl = pathToFileURL(filePath).href;

        expect(FileUtil.getPathName(fileUrl)).toBe("file.js");
        expect(FileUtil.getPathName("folder/file.js")).toBe("file.js");
        expect(FileUtil.getPathName("folder\\file.js")).toBe("file.js");
        expect(FileUtil.getPathName("alpha")).toBe("alpha");
    });

    test("checks whether files and directories exist", async () => {
        const dirPath = path.join(tempDir, "nested"),
            filePath = path.join(tempDir, "data.txt"),
            fileUrl = pathToFileURL(filePath).href,
            missingPath = path.join(tempDir, "missing.txt");

        await fs.mkdir(dirPath);
        await fs.writeFile(filePath, "hello");

        await expect(FileUtil.isDirectory(dirPath)).resolves.toBe(true);
        await expect(FileUtil.isDirectory(filePath)).resolves.toBe(false);
        await expect(FileUtil.isDirectory(missingPath)).resolves.toBe(false);

        await expect(FileUtil.isFile(filePath)).resolves.toBe(true);
        await expect(FileUtil.isFile(fileUrl)).resolves.toBe(true);
        await expect(FileUtil.isFile(dirPath)).resolves.toBe(false);
        await expect(FileUtil.isFile(missingPath)).resolves.toBe(false);
    });

    test("rethrows non-ENOENT stat errors", async () => {
        vi.spyOn(fs, "stat").mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
        await expect(FileUtil.isDirectory("whatever")).rejects.toThrow("denied");
    });
});
