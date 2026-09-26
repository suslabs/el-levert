import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime, executeCommand, getCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeAll(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
}, 30000);

afterAll(async () => {
    await cleanupRuntime(runtime);
}, 30000);

describe("overclock command", () => {
    test("resolves under overclock, oc, and oceu aliases", () => {
        expect(getCommand(runtime, "overclock")).toBeDefined();
        expect(getCommand(runtime, "oc")).toBeDefined();
        expect(getCommand(runtime, "oceu")).toBeDefined();
    });

    test("shows invalid arguments error when no arguments are provided", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "");

        expect(out).toContain("Invalid arguments specified");
        expect(out).toContain("[mode] <EU> <duration>");
        expect(out).toContain("ebf <EU> <duration>");
    });

    test("shows built-in help text with options when --help is passed", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "--help");

        expect(typeof out).toBe("string");
        expect(out).toContain("Description:");
        expect(out).toContain("Usage:");
        expect(out).toContain("--tape");
        expect(out).toContain("--subtick");
        expect(out).toContain("--rates");
        expect(out).toContain("macerator");
    });

    test("calculates standard recipe and formats embed table", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "32 20s");

        expect(out.content).toContain("Input");
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.description).toContain("EU/t");
        expect(out.embeds[0].data.description).toContain("Time");
        expect(out.embeds[0].data.description).toContain("Voltage");
    });

    test("renders chance, parallel, and custom amperage", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "32 20s 10 5 4 2");

        expect(out.embeds[0].data.description).toContain("Chance");
        expect(out.embeds[0].data.description).toContain("Parallel");
        expect(out.embeds[0].data.footer.text).toContain("running 2A of the specified tier");
    });

    test("calculates EBF mode recipe with heat arguments", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "ebf 1920 60.3s 3600 5200 4 2");

        expect(out.content).toContain("Input");
        expect(out.embeds[0].data.description).toContain("EU/t");
        expect(out.embeds[0].data.description).not.toContain("Chance");
    });

    test("calculates LCR mode with perfect overclock", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "lcr 120 20s");

        expect(out.content).toContain("Input");
        expect(out.embeds[0].data.description).toContain("EU/t");
    });

    test("calculates CE and macerator modes with GTCE footer", async () => {
        const command = getCommand(runtime, "overclock");

        const ceOut = await executeCommand(command, "ce 120 20s");
        expect(ceOut.embeds[0].data.footer.text).toContain("Applicable for GTCE");

        const macOut = await executeCommand(command, "macerator 120 20s 10 5");
        expect(macOut.embeds[0].data.footer.text).toContain("Applicable for GTCE");
        expect(macOut.embeds[0].data.description).toContain("Chance");
    });

    test("supports modifiers: --tape, --subtick, --extra, --rf, --tick, --text", async () => {
        const command = getCommand(runtime, "overclock");

        const textOut = await executeCommand(command, "32 20s --tape --subtick --text");
        expect(typeof textOut).toBe("string");
        expect(textOut).toContain("```lua");

        const tickOut = await executeCommand(command, "32 20s --tick --rf");
        expect(tickOut.embeds[0].data.description).toContain("t");
    });

    test("supports rates and item multipliers", async () => {
        const command = getCommand(runtime, "overclock"),
            out = await executeCommand(command, "32 20s --rates --input 2 --output 4 --count 2");

        expect(out.embeds[0].data.description).toContain("Input");
        expect(out.embeds[0].data.description).toContain("Output");
    });

    test("supports automatic JSON and bulk recipes", async () => {
        const command = getCommand(runtime, "overclock"),
            auto = await executeCommand(command, "32 20s --auto"),
            bulk = await executeCommand(command, "--bulk\n32 20s\n120 20s");

        expect(JSON.parse(auto)).toEqual(expect.any(Array));
        expect(bulk).toContain("Recipe 1:");
        expect(bulk).toContain("Recipe 2:");
    });

    test("supports voltage targeting via option and flags", async () => {
        const command = getCommand(runtime, "overclock");

        const optOut = await executeCommand(command, "32 20s --voltage HV");
        expect(optOut.embeds[0].data.description).toContain("HV");

        const colonOut = await executeCommand(command, "32 20s --voltage:HV");
        expect(colonOut.embeds[0].data.description).toContain("HV");

        const flagOut = await executeCommand(command, "32 20s --hv");
        expect(flagOut.embeds[0].data.description).toContain("HV");
    });

    test("formats errors explicitly using ParserError and OCError context", async () => {
        const command = getCommand(runtime, "overclock");

        await expect(executeCommand(command, "32")).resolves.toContain("Missing required argument: **duration**");
        await expect(executeCommand(command, "32 nope")).resolves.toContain("Invalid **duration**: `nope`");
        await expect(executeCommand(command, "ebf 1920 60.3s")).resolves.toContain(
            "Missing required argument: **recipe heat**"
        );
        await expect(executeCommand(command, "32 20s --voltage bogus")).resolves.toContain("Invalid voltage specified");
        await expect(executeCommand(command, "ce 32 20s --extra")).resolves.toContain(
            "Nomifactory CE does not have UEV+ voltage"
        );
        await expect(executeCommand(command, "3000000000 20s")).resolves.toContain("Could not calculate");
        await expect(executeCommand(command, "badmode 120 20s")).resolves.toContain("Invalid recipe mode: `badmode`");
    });
});
