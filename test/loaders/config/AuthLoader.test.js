import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { repoRoot } from "../../helpers/runtimeHarness.js";

import { LoadStatus } from "../../../src/loaders/LoadStatus.js";

let tempRoot;
let originalProjRoot;
let originalProjRootUrl;

async function seedSchemaRoot() {
    await fs.mkdir(path.join(tempRoot, "config"), { recursive: true });
    await fs.mkdir(path.join(tempRoot, "src/config"), { recursive: true });
    await fs.cp(path.join(repoRoot, "src/config/schemas"), path.join(tempRoot, "src/config/schemas"), {
        recursive: true
    });
}

beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-auth-loader-"));
    originalProjRoot = globalThis.projRoot;
    originalProjRootUrl = globalThis.projRootUrl;
});

afterEach(async () => {
    globalThis.projRoot = originalProjRoot;
    globalThis.projRootUrl = originalProjRootUrl;
    vi.restoreAllMocks();
    vi.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("AuthLoader", () => {
    test("prefers json values and fills missing fields from dotenv data", async () => {
        await seedSchemaRoot();

        await fs.writeFile(
            path.join(tempRoot, "config/auth.json"),
            JSON.stringify({
                token: "json-token"
            })
        );
        await fs.writeFile(
            path.join(tempRoot, "config/auth.env"),
            "LEVERET_OWNER=env-owner\nLEVERET_TOKEN=env-token\n"
        );

        globalThis.projRoot = tempRoot;
        globalThis.projRootUrl = pathToFileURL(tempRoot).href;

        const { default: AuthLoader } = await import("../../../src/loaders/config/AuthLoader.js");
        const loader = new AuthLoader(null, {
            throwOnFailure: false,
            processEnv: {}
        });

        await expect(loader.load()).resolves.toEqual([
            {
                token: "json-token",
                owner: "env-owner"
            },
            LoadStatus.successful
        ]);
    });

    test("loads auth from process env when files are absent", async () => {
        await seedSchemaRoot();

        globalThis.projRoot = tempRoot;
        globalThis.projRootUrl = pathToFileURL(tempRoot).href;

        const { default: AuthLoader } = await import("../../../src/loaders/config/AuthLoader.js");
        const loader = new AuthLoader(null, {
            throwOnFailure: false,
            processEnv: {
                LEVERET_TOKEN: "proc-token",
                LEVERET_OWNER: "proc-owner"
            }
        });

        await expect(loader.load()).resolves.toEqual([
            {
                token: "proc-token",
                owner: "proc-owner"
            },
            LoadStatus.successful
        ]);
    });

    test("fails when neither json nor env provides auth", async () => {
        await seedSchemaRoot();

        globalThis.projRoot = tempRoot;
        globalThis.projRootUrl = pathToFileURL(tempRoot).href;

        const { default: AuthLoader } = await import("../../../src/loaders/config/AuthLoader.js");
        const loader = new AuthLoader(null, {
            throwOnFailure: false,
            processEnv: {}
        });

        await expect(loader.load()).resolves.toEqual([null, LoadStatus.failed]);
    });

    test("validates complete and incomplete auth data", async () => {
        const { default: AuthLoader } = await import("../../../src/loaders/config/AuthLoader.js");
        const loader = new AuthLoader(null, {
            throwOnFailure: false
        });

        expect(loader.validate({ token: "t", owner: "o" })).toBe(LoadStatus.successful);
        expect(loader.validate({ token: "", owner: "o" })).toBe(LoadStatus.failed);
        expect(loader.validate({ token: "t", owner: "" })).toBe(LoadStatus.failed);
    });
});
