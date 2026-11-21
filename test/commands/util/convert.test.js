import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime, executeCommand, getCommand } from "../../helpers/commandHarness.js";
import ConversionUtil from "../../../src/util/commands/ConversionUtil.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("convert command", () => {
    test("validates inputs and formats converted values", async () => {
        const command = getCommand(runtime, "convert");

        await expect(executeCommand(command, "")).resolves.toContain("convert");
        await expect(executeCommand(command, "abc eu rf")).resolves.toContain("Invalid input value");
        await expect(executeCommand(command, "1 eu rf")).resolves.toContain("4 RF/t");
        await expect(executeCommand(command, "1 eu ae")).resolves.toContain("2 AE/t");
        await expect(executeCommand(command, "2 b mb")).resolves.toContain("2,000 mB/t");
        await expect(executeCommand(command, "1 eu mb")).resolves.toContain("Can't convert **eu**");
    });

    test("converts single values across compatible units", () => {
        expect(ConversionUtil.convertValue(1, "B", "mb")).toBe(1000);
        expect(ConversionUtil.convertValue(8, "rf", "ae")).toBe(4);
        expect(() => ConversionUtil.convertValue(1, "rf", "b")).toThrow("Incompatible units");
        expect(() => ConversionUtil.convertValue(1, "rf", "nope")).toThrow("Invalid output unit");
        expect(() => ConversionUtil.convertValue(Number.NaN, "rf", "eu")).toThrow("Invalid input value");
    });

    test("validates direct conversion inputs", () => {
        expect(() => ConversionUtil.convert(Number.NaN, "eu", ["rf"])).toThrow("Invalid input value");
        expect(() => ConversionUtil.convert(1, null, ["rf"])).toThrow("Invalid input unit");
        expect(() => ConversionUtil.convert(1, "eu", [null])).toThrow("No output units provided");
    });
});
