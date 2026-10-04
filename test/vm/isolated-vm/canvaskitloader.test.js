import { describe, test, beforeAll, afterAll, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../../../setupGlobals.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { addTag } from "../../helpers/commandHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("Test canvaskitloader execution with isolateGlobals", () => {
    let runtime, vm, msg;
    const cycdrawRoot = "d:/projects/cycdraw";
    
    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            loadVMs: true,
            config: {
                enableEval: true,
                enableInspector: false,
                memLimit: 128,
                timeLimit: 30000,
                maxTagSize: { text: 1024, script: 1024, binary: 1024 }
            }
        });
        vm = runtime.client.tagVM;
        msg = createDiscordMessage("%sort");
        const loaderCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/canvaskitloader.js"), "utf8");
        const cycdrawCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/cycdraw.js"), "utf8");
        const gifencCode = await (await fetch("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.js")).text();

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
        "--size 20 bubble iso",
        "quick --size 30",
        "quick circle"
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
