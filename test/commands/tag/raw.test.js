import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addTag,
    cleanupRuntime,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "body");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag raw command", () => {
    test("returns raw tag data through the real tag structure", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "raw alpha");

        expect(out.files).toHaveLength(1);
    });

    test("formats single-hop alias output with base tag content", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha");

        const out = await executeCommand(command, "raw beta");
        expect(out.content).toContain("**beta** is an alias of **alpha**:");
        expect(out.files[0].attachment.toString()).toContain("body");
    });

    test("formats multi-hop alias chain output with base tag content", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha");
        await executeCommand(command, "alias gamma beta");

        const out = await executeCommand(command, "raw gamma");
        expect(out.content).toContain("**gamma** is an alias of **beta** -> **alpha**:");
        expect(out.files[0].attachment.toString()).toContain("body");
    });
});
