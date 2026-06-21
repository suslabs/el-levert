import { describe, test, beforeAll, afterAll } from "vitest";
import "../../../setupGlobals.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("dump provided vm shapes", () => {
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

    test("prints provided shapes", async () => {
        const out = await vm.runScript(
            `(() => {
                const ownKeys = Reflect.ownKeys;
                const toString = Function.prototype.toString;

                const pick = fn => ({
                    type: typeof fn,
                    name: fn.name,
                    length: fn.length,
                    source: toString.call(fn),
                    ownKeys: ownKeys(fn),
                    descriptors: Object.getOwnPropertyDescriptors(fn)
                });

                const collectFunctions = (rootName, obj) => {
                    const out = {};

                    for (const key of ownKeys(obj)) {
                        const value = obj[key];

                        if (typeof value === "function") {
                            out[rootName + "." + String(key)] = pick(value);
                        }
                    }

                    return out;
                };

                return JSON.stringify({
                    utilKeys: ownKeys(util),
                    msgKeys: ownKeys(msg),
                    httpKeys: ownKeys(http),
                    vmKeys: ownKeys(vm),
                    functions: {
                        ...collectFunctions("msg", msg),
                        ...collectFunctions("util", util),
                        ...collectFunctions("http", http),
                        ...collectFunctions("vm", vm)
                    }
                });
            })()`,
            { msg }
        );

        console.log(out);
    });
});
