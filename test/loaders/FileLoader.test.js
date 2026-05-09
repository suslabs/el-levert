import { describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import FileLoader from "../../src/loaders/FileLoader.js";
import LoadStatus from "../../src/loaders/LoadStatus.js";

describe("FileLoader", () => {
    test("validates file paths in sync and async mode", async () => {
        const syncLoader = new FileLoader("file", "package.json", null, { sync: true });
        expect(syncLoader.load()).toEqual([null, LoadStatus.successful]);

        const badLoader = new FileLoader("file", null, null, {
            sync: true,
            throwOnFailure: false
        });
        expect(badLoader.load()).toEqual([null, LoadStatus.failed]);

        const asyncLoader = new FileLoader("file", "package.json", null, { sync: false });
        await expect(asyncLoader.load()).resolves.toEqual([null, LoadStatus.successful]);
    });
});
