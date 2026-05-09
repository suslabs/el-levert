import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: true,
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

describe("eval command", () => {
    test("loads only the local eval path and runs scripts through real isolated-vm", async () => {
        const command = getCommand(runtime, "eval");

        expect(command.getSubcmd("langs")).not.toBeNull();
        expect(command.getSubcmd("c")).toBeNull();
        expect(command.getSubcmd("cpp")).toBeNull();
        expect(command.getSubcmd("py")).toBeNull();
        expect(command.getSubcmd("vm2")).toBeNull();

        await expect(executeCommand(command, "", { msg: createCommandMessage("%eval") })).resolves.toContain(
            "Can't eval an empty script"
        );

        const out = await executeCommand(command, "```js\n1 + 1\n```", {
            msg: createCommandMessage("%eval ```js\\n1 + 1\\n```")
        });

        expect(out).toEqual([
            "2",
            {
                type: "options",
                useConfigLimits: true
            }
        ]);
    });

    test("is absent when eval is disabled", async () => {
        await cleanupRuntime(runtime);
        runtime = await createCommandRuntime({
            loadVMs: false,
            config: {
                enableEval: false
            }
        });

        expect(runtime.client.commandManager.searchCommands("eval")).toBeNull();
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;

    beforeEach(async () => {
        runtime = await createCommandRuntime({
            loadVMs: false,
            config: {
                enableEval: true,
                enableOtherLangs: true,
                enableVM2: true
            }
        });

        runtime.client.tagVM = {
            runScript: async body => body
        };
        runtime.client.tagVM2 = {
            runScript: async body => `vm2:${body}`
        };
        runtime.client.externalVM = {
            codes: {
                1: "General error"
            },
            runScript: async () => [
                {
                    stdout: "alpha",
                    stderr: "beta"
                },
                3
            ]
        };
        runtime.client.tagManager.downloadBody = async () => ({
            body: "from attachment"
        });
    });

    afterEach(async () => {
        await cleanupRuntime(runtime);
    });

    describe("eval command branch coverage", () => {
        test("loads alternate language subcommands and handles attachment or VM failures", async () => {
            const command = getCommand(runtime, "eval");
            const attachmentMsg = createCommandMessage("%eval", {
                attachments: [
                    {
                        url: "https://example.com/code.js"
                    }
                ]
            });

            expect(command.getSubcmd("c")).not.toBeNull();
            expect(command.getSubcmd("cpp")).not.toBeNull();
            expect(command.getSubcmd("py")).not.toBeNull();
            expect(command.getSubcmd("vm2")).not.toBeNull();

            runtime.client.tagManager.downloadBody = async () => {
                const err = new Error("Too large");
                err.name = "TagError";
                throw err;
            };

            await expect(executeCommand(command, "", { msg: attachmentMsg })).resolves.toBe(":warning: Too large.");

            runtime.client.tagManager.downloadBody = async () => {
                const err = new Error("download failed");
                err.stack = "download stack";
                throw err;
            };

            await expect(executeCommand(command, "", { msg: attachmentMsg })).resolves.toMatchObject({
                content: ":no_entry_sign: Downloading attachment failed:",
                files: expect.any(Array)
            });

            runtime.client.tagVM.runScript = async () => {
                const err = new Error("Stopped");
                err.name = "VMError";
                throw err;
            };

            await expect(executeCommand(command, "```js\n1 + 1\n```", { msg: createCommandMessage("%eval") })).resolves.toEqual([
                ":no_entry_sign: Stopped.",
                {
                    type: "options",
                    useConfigLimits: true
                }
            ]);
        });

        test("formats alternate eval outputs and vm2 execution branches", async () => {
            const command = getCommand(runtime, "eval");
            const cCommand = command.getSubcmd("c");
            const vm2Command = command.getSubcmd("vm2");
            const msg = createCommandMessage("%eval c");

            runtime.client.externalVM.runScript = async () => [
                {
                    compileOutput: "bad syntax"
                },
                6
            ];

            await expect(executeCommand(cCommand, "```c\nint main(){}\n```", { msg })).resolves.toMatchObject({
                content: ":no_entry_sign: Script compilation failed:",
                files: expect.any(Array)
            });

            runtime.client.externalVM.runScript = async () => {
                const err = new Error(JSON.stringify({ stderr: ["bad stream"], compile_output: "bad code" }));
                err.name = "ExternalVMError";
                throw err;
            };

            await expect(executeCommand(cCommand, "```c\nbad\n```", { msg })).resolves.toContain("Bad stream\nBad code");

            runtime.client.externalVM.runScript = async () => {
                const err = new Error("service unavailable");
                err.name = "ExternalVMError";
                throw err;
            };

            await expect(executeCommand(cCommand, "```c\nbad\n```", { msg })).resolves.toContain("Unexpected token");

            runtime.client.externalVM.runScript = async () => [{}, 1];
            await expect(executeCommand(cCommand, "```c\nbad\n```", { msg })).resolves.toBe(":no_entry_sign: General error.");

            runtime.client.externalVM.runScript = async () => [
                {
                    stdout: "alpha",
                    stderr: "beta"
                },
                3
            ];

            await expect(executeCommand(cCommand, "```c\nok\n```", { msg })).resolves.toContain("stderr:\nbeta");
            await expect(executeCommand(vm2Command, "```js\n2 + 2\n```", { msg })).resolves.toBe("vm2:2 + 2");
        });
    });
});
