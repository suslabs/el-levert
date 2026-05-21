import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import VMError from "../../../src/errors/VMError.js";
import VMErrors from "../../../src/vm/isolated-vm/VMErrors.js";
import { createDiscordChannel, createDiscordMessage, createDiscordUser } from "../../helpers/discordStubs.js";
import { addTag } from "../../helpers/commandHarness.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let vm;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        config: {
            enableEval: true,
            enableInspector: false,
            memLimit: 64,
            timeLimit: 50
        }
    });

    vm = runtime.client.tagVM;
}, 20000);

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
    vm = null;
}, 20000);

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
        await expect(context.vmObjects.set("msg", Object, [{}])).rejects.toThrow("Object msg already exists");

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

    test("bridges util tag helpers through the vm with real tag data", async () => {
        const msg = createDiscordMessage("hello");

        await addTag(runtime, "plain", "alpha body", "user-1", "text");
        await addTag(runtime, "scripted", "tag.name + ':' + (tag.args ?? '')", "user-1", "ivm");
        await addTag(runtime, "scripted_undefined", "String(tag.args === undefined)", "user-1", "ivm");
        await addTag(
            runtime,
            "scripted_timer",
            "new Promise(resolve => setTimeout(() => resolve(tag.name + ':' + (tag.args ?? '')), 5))",
            "user-1",
            "ivm"
        );

        const alias = await runtime.client.tagManager.fetch("plain");
        await runtime.client.tagManager.alias(null, alias, "bound", {
            name: "plain_alias",
            owner: "user-1"
        });

        await expect(
            vm.runScript("(async () => (await util.fetchTag('plain')).body)()", { msg })
        ).resolves.toBe("alpha body");

        await expect(
            vm.runScript("(async () => (await util.fetchTag('scripted')).type)()", { msg })
        ).resolves.toBe("3");

        await expect(
            vm.runScript("(async () => (await util.fetchTag('plain_alias')).name + ':' + (await util.fetchTag('plain_alias')).body)()", { msg })
        ).resolves.toBe("plain_alias:alpha body");

        await expect(
            vm.runScript("(async () => (await util.dumpTags(true)).find(tag => tag.name === 'scripted').type)()", { msg })
        ).resolves.toBe("3");

        await expect(
            vm.runScript("util.executeTag('plain')", { msg })
        ).resolves.toBe("alpha body");

        await expect(
            vm.runScript("util.executeTag('scripted', ['left', 'right'])", { msg })
        ).resolves.toBe("scripted:left right ");

        await expect(
            vm.runScript("util.executeTagSafe('scripted_timer', ['left', 'right'])", { msg })
        ).resolves.toBe("scripted_timer:left right");

        await expect(
            vm.runScript("util.executeTag('scripted_undefined')", { msg })
        ).resolves.toBe("true");

        await expect(
            vm.runScript("util.executeTag('missing')", { msg })
        ).rejects.toThrow("Tag missing doesn't exist");
    });

    test("bridges util message and user helpers through the vm", async () => {
        const msg = createDiscordMessage("hello");

        runtime.client.fetchMessage = async channelId =>
            channelId !== "missing-default"
                ? createDiscordMessage("fetched body", {
                      id: "fetched-1",
                      channel: createDiscordChannel({
                          id: channelId,
                          messages: {
                              cache: {
                                  last: () => [{ id: "fetched-1" }, { id: "prev-1" }]
                              }
                          }
                      }),
                      author: createDiscordUser({
                          id: "author-1",
                          username: "fetched-user"
                      })
                  })
                : null;

        runtime.client.fetchMessages = async channelId => {
            if (channelId === "return-null") {
                return null;
            }

            return [
                createDiscordMessage("fallback-1", {
                    id: "fallback-1",
                    channel: createDiscordChannel({
                        id: channelId,
                        messages: {
                            cache: {
                                last: () => [{ id: "fallback-1" }, { id: "fallback-0" }]
                            }
                        }
                    })
                }),
                createDiscordMessage("fallback-2", {
                    id: "fallback-2",
                    channel: createDiscordChannel({
                        id: channelId,
                        messages: {
                            cache: {
                                last: () => [{ id: "fallback-2" }, { id: "fallback-1" }]
                            }
                        }
                    })
                })
            ];
        };

        runtime.client.findUserById = async id =>
            createDiscordUser({
                id,
                username: `user-${id}`,
                globalName: `global-${id}`
            });

        runtime.client.findUsers = async query => [
            {
                ...createDiscordUser({
                    id: `${query}-1`,
                    username: `user-${query}`
                }),
                nickname: `nick-${query}`,
                displayName: `display-${query}`,
                _roles: ["role-1"]
            }
        ];

        await expect(
            vm.runScript("(async () => (await util.fetchMessage('user-1', 'fallback-default', 'channel-hit', 'msg-1')).content)()", { msg })
        ).resolves.toBe("fetched body");

        await expect(
            vm.runScript("(async () => (await util.fetchMessage('user-1', 'fallback-default', null, 'msg-1')).content)()", { msg })
        ).resolves.toBe("fetched body");

        runtime.client.fetchMessage = async () => null;

        await expect(
            vm.runScript("(async () => (await util.fetchMessage('user-1', 'fallback-default', null, 'msg-1')) === null)()", { msg })
        ).resolves.toBe("true");

        await expect(
            vm.runScript("(async () => (await util.fetchMessages('user-1', 'fallback-default', 'missing-channel', {})).map(msg => msg.content).join(','))()", { msg })
        ).resolves.toBe("fallback-1,fallback-2");

        await expect(
            vm.runScript("(async () => (await util.findUserById('abc')).globalName)()", { msg })
        ).resolves.toBe("global-abc");

        await expect(
            vm.runScript("(async () => (await util.findUsers('alpha'))[0].displayName + ':' + (await util.findUsers('alpha'))[0].roles[0])()", { msg })
        ).resolves.toBe("display-alpha:role-1");
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
