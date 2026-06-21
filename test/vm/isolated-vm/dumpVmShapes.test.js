import { describe, test, beforeAll, afterAll } from "vitest";
import "../../../setupGlobals.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("dump vm function shapes", () => {
    let runtime;
    let vm;
    let msg;

    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            config: {
                enableEval: true,
                enableInspector: false,
                memLimit: 64,
                timeLimit: 100
            }
        });

        vm = runtime.client.tagVM;
        msg = createDiscordMessage("hello");
    }, 30000);

    afterAll(async () => {
        await cleanupRuntime(runtime);
    }, 30000);

    test("prints shapes", async () => {
        const out = await vm.runScript(
            `(() => {
      const pick = fn => ({
        type: typeof fn,
        name: fn.name,
        length: fn.length,
        source: Function.prototype.toString.call(fn),
        ownKeys: Reflect.ownKeys(fn),
        desc: Object.getOwnPropertyDescriptors(fn)
      });
      return JSON.stringify({
        getCpuTime: pick(vm.getCpuTime),
        getWallTime: pick(vm.getWallTime),
        timeElapsed: pick(vm.timeElapsed),
        timeRemaining: pick(vm.timeRemaining)
      });
    })()`,
            { msg }
        );

        console.log(out);
    });
});
