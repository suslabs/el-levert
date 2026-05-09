import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let tempRoot;
let originalProjRoot;
let originalProjRootUrl;

beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-init-"));
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

describe("init", () => {
    test("loads config, constructs the real client, and starts it", async () => {
        vi.resetModules();
        await import("../setupGlobals.js");

        const { LevertClient } = await import("../src/LevertClient.js");
        const startSpy = vi.spyOn(LevertClient.prototype, "start").mockResolvedValue(undefined);
        const ctorSpy = vi.spyOn(LevertClient.prototype, "setConfigs");

        const { default: init } = await import("../src/init.js");

        await expect(init()).resolves.toBeUndefined();

        expect(ctorSpy).toHaveBeenCalledOnce();
        expect(startSpy).toHaveBeenCalledOnce();
    });

    test("exits with status 1 when real config loading fails", async () => {
        globalThis.projRoot = tempRoot;
        globalThis.projRootUrl = pathToFileURL(tempRoot).href;

        vi.resetModules();

        const exitSpy = vi.spyOn(process, "exit").mockImplementation(code => {
            throw new Error(`exit:${code}`);
        });

        const { default: init } = await import("../src/init.js");
        await expect(init()).rejects.toThrow("exit:1");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
