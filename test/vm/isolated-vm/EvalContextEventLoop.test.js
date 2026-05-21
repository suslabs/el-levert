import { afterEach, describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let context;

async function createContext(options = {}) {
    runtime = await createRuntime({
        loadManagers: true,
        config: {
            enableEval: true,
            enableInspector: false,
            memLimit: options.memLimit ?? 64,
            timeLimit: options.timeLimit ?? 500
        }
    });

    context = await runtime.client.tagVM._getEvalContext({
        msg: createDiscordMessage("event loop test")
    });
    return context;
}

afterEach(async () => {
    context?.dispose();
    context = null;

    await cleanupRuntime(runtime);
    runtime = null;
});

describe("EvalContext event loop", () => {
    test("awaits a timeout-backed promise and passes timeout arguments", async () => {
        const evalContext = await createContext();

        await expect(
            evalContext.runScript(`
                new Promise(resolve => {
                    setTimeout((left, right) => resolve(left + ":" + right), 5, "alpha", "beta");
                })
            `)
        ).resolves.toEqual(["alpha:beta", null]);
    });

    test("clears timeouts before they run", async () => {
        const evalContext = await createContext();

        await expect(
            evalContext.runScript(`
                new Promise(resolve => {
                    let value = "kept";
                    const id = setTimeout(() => {
                        value = "changed";
                    }, 5);

                    clearTimeout(id);
                    setTimeout(() => resolve(value), 15);
                })
            `)
        ).resolves.toEqual(["kept", null]);
    });

    test("runs intervals until cleared", async () => {
        const evalContext = await createContext();

        await expect(
            evalContext.runScript(`
                new Promise(resolve => {
                    let count = 0;
                    const id = setInterval(() => {
                        count += 1;

                        if (count === 3) {
                            clearInterval(id);
                            resolve(count);
                        }
                    }, 2);
                })
            `)
        ).resolves.toEqual([3, null]);
    });

    test("supports nested timers and promise microtasks between timer turns", async () => {
        const evalContext = await createContext();

        await expect(
            evalContext.runScript(`
                new Promise(resolve => {
                    const events = [];

                    setTimeout(() => {
                        events.push("timeout");
                        Promise.resolve().then(() => events.push("microtask"));
                        setTimeout(() => resolve(events.join(",")), 5);
                    }, 5);
                })
            `)
        ).resolves.toEqual(["timeout,microtask", null]);
    });

    test("clears pending timers on dispose", async () => {
        const evalContext = await createContext();

        await evalContext.runScript(`
            globalThis.timerRan = false;
            setTimeout(() => {
                globalThis.timerRan = true;
            }, 25);
            "scheduled";
        `);

        evalContext.dispose();

        await new Promise(resolve => setTimeout(resolve, 40));
        expect(evalContext.eventLoop).toBeUndefined();
    });

    test("validates timer callbacks", async () => {
        const evalContext = await createContext();

        await expect(evalContext.runScript("setTimeout('nope', 1)")).resolves.toEqual([
            undefined,
            expect.objectContaining({
                name: "TypeError"
            })
        ]);
    });
});
