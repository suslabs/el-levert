import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime, executeCommand, getCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("overclock command", () => {
    test("shows usage errors and renders a result table for valid input", async () => {
        const command = getCommand(runtime, "overclock");

        await expect(executeCommand(command, "")).resolves.toContain("Invalid arguments specified");

        const out = await executeCommand(command, "32 20s");
        expect(out.content).toContain("Input");
        expect(out.embeds).toHaveLength(1);
    });
});

describe("Merged Branch Coverage", () => {
    describe("overclock command branch coverage", () => {
        test("covers parse failures and empty overclock results", async () => {
            const command = getCommand(runtime, "overclock");

            await expect(executeCommand(command, "32")).resolves.toContain("Invalid arguments specified");
            await expect(executeCommand(command, "32 nope")).resolves.toContain("Invalid arguments specified");
            await expect(executeCommand(command, "3000000000 20s")).resolves.toContain("Could not calculate");
        });

        test("renders chance, parallel, and ebf-specific output layouts", async () => {
            const command = getCommand(runtime, "overclock");

            const parallel = await executeCommand(command, "32 20s 10 5 4 2");
            expect(parallel.embeds[0].data.description).toContain("Chance");
            expect(parallel.embeds[0].data.footer.text).toContain("Manually specify the amperage");

            const ebf = await executeCommand(command, "ebf 32 20s 1800 3600 2 4");
            expect(ebf.content).toContain("Input");
            expect(ebf.embeds[0].data.description).not.toContain("Chance");
        });
    });
});
