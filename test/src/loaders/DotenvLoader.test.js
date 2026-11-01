import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import DotenvLoader from "../../../src/loaders/DotenvLoader.js";

import { LoadStatus } from "../../../src/loaders/LoadStatus.js";

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-dotenv-loader-"));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("DotenvLoader", () => {
    test("parses dotenv data and keeps existing env values by default", async () => {
        const filePath = path.join(tempDir, "sample.env");

        await fs.writeFile(filePath, 'A=file-a\nB="line\\nvalue"\n');

        const processEnv = {
                A: "env-a",
                C: "env-c"
            },
            loader = new DotenvLoader("auth", filePath, null, {
                processEnv,
                throwOnFailure: false
            });

        await expect(loader.load()).resolves.toEqual([
            {
                A: "env-a",
                B: "line\nvalue",
                C: "env-c"
            },
            LoadStatus.successful
        ]);

        expect(processEnv).toEqual({
            A: "env-a",
            C: "env-c"
        });
    });

    test("fails when the dotenv file is missing", async () => {
        const loader = new DotenvLoader("auth", path.join(tempDir, "missing.env"), null, {
            processEnv: {
                LEVERET_TOKEN: "token"
            },
            throwOnFailure: false
        });

        await expect(loader.load()).resolves.toEqual([null, LoadStatus.failed]);
    });
});
