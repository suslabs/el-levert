import { describe, test, beforeAll, afterAll, expect } from "vitest";
import fs from "node:fs";
import "../../../setupGlobals.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("Canvaskitloader Math.random tamper", () => {
    let runtime, vm, msg, loaderCode;

    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            config: {
                enableEval: true,
                enableInspector: false,
                memLimit: 128,
                timeLimit: 5000
            }
        });

        vm = runtime.client.tagVM;
        msg = createDiscordMessage("hello");
        loaderCode = fs.readFileSync("d:/projects/nodejs/cycdraw/canvaskit/canvaskitloader.js", "utf8");
    }, 30000);

    afterAll(async () => {
        await cleanupRuntime(runtime);
    }, 30000);

    test("detects Math.random tampering", async () => {
        const script = `
            Math.random = function random() { return 0; };
            util.inspectorEnabled = false;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });
});
