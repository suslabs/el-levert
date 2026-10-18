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

describe("tag uses command", () => {
    test("returns 0 times for tag that has never been used", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "uses alpha");

        expect(out).toContain("Tag **alpha** has been used **0** times.");
    });

    test("returns 1 time when tag has been used once", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alpha");

        const out = await executeCommand(command, "uses alpha");
        expect(out).toContain("Tag **alpha** has been used **1** time.");
    });

    test("returns multiple times when tag has been used repeatedly", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alpha");
        await executeCommand(command, "alpha");
        await executeCommand(command, "alpha");

        const out = await executeCommand(command, "uses alpha");
        expect(out).toContain("Tag **alpha** has been used **3** times.");
    });

    test("works with usage alias", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alpha");

        const out = await executeCommand(command, "usage alpha");
        expect(out).toContain("Tag **alpha** has been used **1** time.");
    });

    test("returns warning for non-existent tag", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "uses nonexistent");

        expect(out).toContain("Tag **nonexistent** doesn't exist.");
    });

    test("returns warning for invalid tag name", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "uses invalid!name");

        expect(out).toContain("The tag name must consist of Latin characters, numbers, _ or -.");
    });
});
