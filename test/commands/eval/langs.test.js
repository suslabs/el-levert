import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        config: {
            enableEval: true,
            enableOtherLangs: false,
            enableVM2: false
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("eval langs command", () => {
    test("reports only the languages enabled in the real command tree", async () => {
        const command = getCommand(runtime, "eval");
        const out = await executeCommand(command, "langs", {
            msg: createCommandMessage("%eval langs")
        });

        expect(out.content).toContain("Supported languages");
        expect(out.embeds[0].data.description).toContain("js - **By default**");
        expect(out.embeds[0].data.description).not.toContain("py");
    });
});
