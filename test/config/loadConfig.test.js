import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { repoRoot } from "../helpers/runtimeHarness.js";

let tempRoot;
let originalProjRoot;
let originalProjRootUrl;

async function seedConfigRoot(overrides = {}) {
    await fs.mkdir(path.join(tempRoot, "config"), { recursive: true });
    await fs.mkdir(path.join(tempRoot, "src/config"), { recursive: true });
    await fs.cp(path.join(repoRoot, "src/config/schemas"), path.join(tempRoot, "src/config/schemas"), {
        recursive: true
    });

    const config = {
        ...JSON.parse(await fs.readFile(path.join(repoRoot, "config/config.json"), "utf8")),
        ...(overrides.config ?? {})
    };
    const reactions = {
        ...JSON.parse(await fs.readFile(path.join(repoRoot, "config/reactions.json"), "utf8")),
        ...(overrides.reactions ?? {})
    };
    const auth = {
        ...JSON.parse(await fs.readFile(path.join(repoRoot, "config/auth.json"), "utf8")),
        ...(overrides.auth ?? {})
    };

    await fs.writeFile(path.join(tempRoot, "config/config.json"), JSON.stringify(config, null, 4));
    await fs.writeFile(path.join(tempRoot, "config/reactions.json"), JSON.stringify(reactions, null, 4));
    await fs.writeFile(path.join(tempRoot, "config/auth.json"), JSON.stringify(auth, null, 4));
}

beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-config-"));
    originalProjRoot = globalThis.projRoot;
    originalProjRootUrl = globalThis.projRootUrl;
});

afterEach(async () => {
    globalThis.projRoot = originalProjRoot;
    globalThis.projRootUrl = originalProjRootUrl;
    vi.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("loadConfig", () => {
    test("loads all config sections through the real loaders", async () => {
        await seedConfigRoot();
        globalThis.projRoot = tempRoot;
        globalThis.projRootUrl = pathToFileURL(tempRoot).href;

        vi.resetModules();
        const { default: loadConfig } = await import("../../src/config/loadConfig.js");

        const out = await loadConfig(console);
        expect(out).toHaveProperty("config");
        expect(out).toHaveProperty("reactions");
        expect(out).toHaveProperty("auth");
    });

    test("returns null when a real loader fails", async () => {
        await seedConfigRoot({
            config: {
                cmdPrefix: 1
            }
        });
        globalThis.projRoot = tempRoot;
        globalThis.projRootUrl = pathToFileURL(tempRoot).href;

        vi.resetModules();
        const { default: loadConfig } = await import("../../src/config/loadConfig.js");

        await expect(loadConfig(console)).resolves.toBeNull();
    });
});
