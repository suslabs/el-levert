import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import ObjectLoader from "../../src/loaders/ObjectLoader.js";
import LoadStatus from "../../src/loaders/LoadStatus.js";

let tempDir;
let filePath;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-object-loader-"));
    filePath = path.join(tempDir, "sample.js");
    await fs.writeFile(filePath, "export default { ok: true };\n");
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("ObjectLoader", () => {
    test("imports module objects and refuses sync mode", async () => {
        const loader = new ObjectLoader("object", filePath, null, {
            sync: false
        });

        await expect(loader.load()).resolves.toEqual([{ ok: true }, LoadStatus.successful]);
        expect(() => loader.write()).toThrow("Can't write an object file");

        const syncLoader = new ObjectLoader("object", filePath, null, {
            sync: true,
            throwOnFailure: false
        });
        await expect(syncLoader.load()).resolves.toEqual([null, LoadStatus.failed]);
    });
});
