import { afterAll, beforeAll, describe, expect, test } from "vitest";
import path from "node:path";

import "../setupGlobals.js";

import { createDiscordMessage } from "./helpers/discordStubs.js";
import { cleanupRuntime, createRuntime, repoRoot } from "./helpers/runtimeHarness.js";

describe("dropflow loader test with live db", () => {
    let runtime, vm;

    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            config: {
                dbPath: path.resolve(repoRoot, "db"),
                enableEval: true,
                memLimit: 512,
                timeLimit: 120000,
                maxQuota: -1,
                maxTagCount: -1
            }
        });

        vm = runtime.client.tagVM;
    }, 60000);

    afterAll(async () => {
        if (runtime) {
            await cleanupRuntime(runtime);
            runtime = null;
            vm = null;
        }
    }, 30000);

    test("loads dropflow successfully via canvaskitloader", async () => {
        const script = `
            util.loadLibrary = "dropflow";
            eval(util.fetchTag("canvaskitloader").body);

            typeof globalThis.dropflow;
        `;

        const msg = createDiscordMessage("");
        const result = await vm.runScript(script, {
            msg,
            tag: { name: "test_dropflow" },
            args: ""
        });

        console.log("dropflow typeof result:", result);
        expect(result).toBe("object");
    }, 60000);

    test("can use dropflow to generate layout/style", async () => {
        const script = `
            util.loadLibrary = "dropflow";
            eval(util.fetchTag("canvaskitloader").body);

            const hasMethods = typeof dropflow.layout === "function" && typeof dropflow.style === "function" && typeof dropflow.dom === "function";
            JSON.stringify({ hasMethods, keys: Object.keys(dropflow) });
        `;

        const msg = createDiscordMessage("");
        const result = await vm.runScript(script, {
            msg,
            tag: { name: "test_dropflow_usage" },
            args: ""
        });

        console.log("dropflow methods result:", result);
        const parsed = JSON.parse(result);
        expect(parsed.hasMethods).toBe(true);
    }, 60000);
});
