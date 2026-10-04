import { describe, test, beforeAll, afterAll, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../../../setupGlobals.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { addTag } from "../../helpers/commandHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("Test canvaskitloader execution with isolateGlobals", () => {
    let runtime, vm, msg;
    const cycdrawRoot = "d:/projects/nodejs/cycdraw";
    const gifencRoot = "d:/projects/nodejs/gifenc";

    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            loadVMs: true,
            config: {
                enableEval: true,
                enableInspector: false,
                memLimit: 128,
                timeLimit: 30000
            }
        });
        vm = runtime.client.tagVM;
        msg = createDiscordMessage("%sort");
        const loaderCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/canvaskitloader.js"), "utf8");
        const cycdrawCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/cycdraw.js"), "utf8");
        const gifencCode = fs.readFileSync(path.join(gifencRoot, "dist/index.js"), "utf8");

        const tagOwner = "883072834790916137";
        await addTag(runtime, "canvaskitloader", loaderCode, tagOwner, { type: "ivm" });
        await addTag(runtime, "ck_cycdraw", cycdrawCode, tagOwner, { type: "text" });
        await addTag(runtime, "ck_gifenc", gifencCode, tagOwner, { type: "text" });
    }, 120000);

    afterAll(async () => {
        await cleanupRuntime(runtime);
    }, 60000);

    const testCases = [
        "bubble",
        "selection",
        "insertion",
        "quick",
        "heap",
        "merge",
        "merge in place",
        "radix lsd in place",
        "gravity",
        "shell",
        "bitonic",
        "bubble iso",
        "quick phase"
    ];

    for (const testCase of testCases) {
        test("test sort with isolateGlobals: " + testCase, async () => {
            const newSortCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/build/sort/sort.min.js"), "utf8");

            const script = `
                (() => {
                    delete util.env;
                    globalThis.tag = { name: "sort", args: "${testCase}" };
                    try {
                        ${newSortCode}
                        return "success";
                    } catch (err) {
                        return (err.stack ?? err.toString()) + "\\nCaused by: " + (err.cause?.stack ?? err.cause);
                    }
                })()
            `.trim();

            const res = await vm.runScript(script, { msg });
            console.log("TEST [${testCase}]: ", res);
            expect(res?.files?.[0]?.attachment?.length).toBeGreaterThan(0);
        }, 60000);
    }
});
