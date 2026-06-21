import { describe, test, beforeAll, afterAll, expect } from "vitest";
import fs from "node:fs";
import "../../../setupGlobals.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("Canvaskitloader Integrity Integration", () => {
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

    test("passes under normal conditions with integrity checks enabled", async () => {
        const script = `
            util.inspectorEnabled = false;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toBe(".");
    });

    test("detects tampering before execution", async () => {
        const script = `
            Math.sin = function sin(x) { return 0; };
            util.inspectorEnabled = true;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });

    test("detects tampering after a module load", async () => {
        const modifiedLoaderCode = loaderCode.replace(
            'IntegrityChecker.check("after", Benchmark.getCount("module_load"));',
            'util.delay = http.request; IntegrityChecker.check("after", Benchmark.getCount("module_load"));'
        );

        const script = `
            (() => {
                util.inspectorEnabled = true;
                util._integrityChecks = true;
                util.loadLibrary = "none";
                eval(${JSON.stringify(modifiedLoaderCode)});
                try {
                    ModuleLoader.loadModuleFromSource("let x = 1;", {}, false, { cache: false });
                    return "no fail";
                } catch (err) {
                    return String(err?.message ?? err);
                }
            })()
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });

    test("detects reference swap among provided functions", async () => {
        const modifiedLoaderCode = loaderCode.replace(
            'IntegrityChecker.check("before");',
            'util.delay = http.request; IntegrityChecker.check("before");'
        );

        const script = `
            util.inspectorEnabled = true;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(modifiedLoaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });

    test("detects getter/setter addition on provided objects", async () => {
        const script = `
            Object.defineProperty(msg, "content", { get() { return "hijacked"; }, configurable: true });
            util.inspectorEnabled = true;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });

    test("detects proxying of nested structures", async () => {
        const script = `
            msg.author = new Proxy(msg.author, {});
            util.inspectorEnabled = true;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });

    test("detects custom function injections", async () => {
        const script = `
            msg.hijack = function() {};
            util.inspectorEnabled = true;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });

    test("detects prototype tampering on provided structures", async () => {
        const script = `
            Object.setPrototypeOf(msg, { hijacked: true });
            util.inspectorEnabled = true;
            util._integrityChecks = true;
            util.loadLibrary = "none";
            eval(${JSON.stringify(loaderCode)});
        `.trim();

        const res = await vm.runScript(script, { msg });
        expect(res).toContain("Integrity check failed");
    });
});
