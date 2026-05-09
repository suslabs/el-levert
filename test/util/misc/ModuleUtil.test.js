import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import ModuleUtil from "../../../src/util/misc/ModuleUtil.js";

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-tests-"));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("ModuleUtil", () => {
    test("imports modules, resolves promised barrel entries, and warns for missing optional dependencies", async () => {
        const modulePath = path.join(tempDir, "counter.js");

        await fs.writeFile(modulePath, "export default 1;\n");
        await expect(ModuleUtil.import(modulePath)).resolves.toBe(1);

        await fs.writeFile(modulePath, "export default 2;\n");
        await expect(ModuleUtil.import(modulePath, false)).resolves.toBe(2);

        class Alpha {
            static $name = "alpha";
        }

        const barrel = ModuleUtil.compileExports({
            Alpha,
            Beta: Promise.resolve(
                class Beta {
                    static $name = "beta";
                }
            )
        });

        expect(Object.keys(barrel)).toContain("alpha");
        expect(Object.keys(barrel).some(name => name.startsWith("dummy"))).toBe(true);

        await ModuleUtil.resolveBarrel(barrel);

        expect(barrel.beta.name).toBe("Beta");

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(
            ModuleUtil.loadOptionalModule("definitely-missing-package", import.meta.url, "./missing.js")
        ).resolves.toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });
});
