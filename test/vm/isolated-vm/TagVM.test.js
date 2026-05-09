import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import VMError from "../../../src/errors/VMError.js";
import VMErrors from "../../../src/vm/isolated-vm/VMErrors.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let vm;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        config: {
            enableEval: true,
            enableInspector: false,
            memLimit: 64,
            timeLimit: 50
        }
    });

    vm = runtime.client.tagVM;
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
    vm = null;
});

describe("TagVM", () => {
    test("executes real scripts through isolated-vm and constructs real eval contexts", async () => {
        const msg = createDiscordMessage("hello");

        await expect(vm.runScript("1 + 1", { msg })).resolves.toBe("2");
        await expect(vm.runScript("({ alpha: 1, beta: [2, 3] })", { msg })).resolves.toBe('{"alpha":1,"beta":[2,3]}');

        const context = await vm._getEvalContext({
            msg: createDiscordMessage("hello")
        });

        expect(context.memLimit).toBe(64);
        expect(context.timeLimit).toBe(50);
        expect(context.enableInspector).toBe(false);
        await expect(context.runScript("vm.timeRemaining() >= 0")).resolves.toEqual([true, null]);

        context.dispose();
    });

    test("uses the real reply path and still guards inspector-connected execution", async () => {
        const msg = createDiscordMessage("hello");

        await expect(vm.runScript('msg.reply("hello from vm")', { msg })).resolves.toMatchObject({
            content: "hello from vm"
        });

        vm._inspectorServer = {
            inspectorConnected: true
        };

        await expect(vm.runScript("1 + 1")).rejects.toThrow("Inspector is already connected.");
        delete vm._inspectorServer;
    });

    test("processes reply payloads and mapped VM error branches directly", () => {
        expect(
            vm._processReply(
                JSON.stringify({
                    file: {
                        data: {
                            0: 65,
                            1: 66
                        },
                        name: "out.txt"
                    },
                    content: "ok"
                })
            )
        ).toMatchObject({
            content: "ok",
            files: expect.any(Array)
        });

        expect(vm._processReply("{\"content\":\"plain\"}")).toEqual({
            content: "plain"
        });

        expect(() =>
            vm._handleScriptError({
                name: "VMError",
                message: "broken"
            })
        ).toThrow("broken");

        expect(
            vm._handleScriptError({
                name: VMErrors.custom[0],
                exitData: "done"
            })
        ).toEqual(["done", "exit"]);

        expect(() =>
            vm._handleScriptError({
                name: "OtherError",
                message: "unknown"
            })
        ).toThrow("unknown");

        expect(() =>
            vm._handleScriptError({
                name: "OtherError",
                message: VMErrors.timeout.in
            })
        ).toThrow(new VMError(VMErrors.timeout.out).message);
    });
});
