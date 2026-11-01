import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";

import VMError from "@el-levert/common/errors/VMError.js";
import { VMErrors } from "@el-levert/runner/vm/VMErrors.js";
import { createDiscordChannel, createDiscordMessage, createDiscordUser } from "../helpers/discordStubs.js";
import { addTag } from "../helpers/commandHarness.js";
import { cleanupRuntime, createRuntime } from "../helpers/runtimeHarness.js";

let runtime;
let vm;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        config: {
            enableEval: true,
            vmInspector: { enable: false },
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
        await expect(vm.runScript("const value: number = 2; value + 1", { msg }, { language: "ts" })).resolves.toBe(
            "3"
        );
        await expect(vm.runScript("({ alpha: 1, beta: [2, 3] })", { msg })).resolves.toBe('{"alpha":1,"beta":[2,3]}');

        const guildMsg = createDiscordMessage("hello", {
            guildId: "guild-1"
        });

        await expect(
            vm.runScript("msg.author.guildId === msg.guildId && msg.author.displayName === 'alex'", { msg: guildMsg })
        ).resolves.toBe("true");

    });

    test("uses the real reply path", async () => {
        const msg = createDiscordMessage("hello");

        await expect(vm.runScript('msg.reply("hello from vm")', { msg })).resolves.toMatchObject({
            content: "hello from vm"
        });
    });

    test("logs reply data using hex formatting for binary attachments when debug is enabled", async () => {
        const msg = createDiscordMessage("hello");

        const debugSpy = vi.spyOn(runtime.client.logger, "debug"),
            isDebugSpy = vi.spyOn(runtime.client.logger, "isDebugEnabled").mockReturnValue(true);

        const script = 'msg.reply({ content: "", file: { data: [137, 80, 78, 71, 0, 1], name: "image.png" } })';

        const res = await vm.runScript(script, { msg });
        expect(res.files).toHaveLength(1);
        expect(res.files[0].name).toBe("image.png");

        const replyLogCall = debugSpy.mock.calls.find(call => call[0]?.startsWith("Returning reply data:"));
        expect(replyLogCall).toBeDefined();
        expect(replyLogCall[0]).toContain("image.png");
        expect(replyLogCall[0]).toContain("89504e470001");
        expect(replyLogCall[0]).not.toContain('"type":"Buffer"');

        isDebugSpy.mockRestore();
        debugSpy.mockRestore();
    });

    test("bridges util tag helpers through the vm with real tag data", async () => {
        const msg = createDiscordMessage("hello");

        await addTag(runtime, "plain", "alpha body", "user-1", { type: "text" });
        await addTag(runtime, "scripted", "tag.name + ':' + (tag.args ?? '')", "user-1", { type: "ivm" });
        await addTag(runtime, "scripted_undefined", "String(tag.args === undefined)", "user-1", { type: "ivm" });
        await addTag(
            runtime,
            "scripted_timer",
            "new Promise(resolve => setTimeout(() => resolve(tag.name + ':' + (tag.args ?? '')), 5))",
            "user-1",
            { type: "ivm" }
        );

        const alias = await runtime.client.tagManager.fetch("plain");
        await runtime.client.tagManager.alias(null, alias, "bound", {
            name: "plain_alias",
            owner: "user-1"
        });

        await expect(vm.runScript("(async () => (await util.fetchTag('plain')).body)()", { msg })).resolves.toBe(
            "alpha body"
        );

        await expect(vm.runScript("(async () => (await util.fetchTag('scripted')).type)()", { msg })).resolves.toBe(
            "3"
        );

        await expect(
            vm.runScript(
                "(async () => (await util.fetchTag('plain_alias')).name + ':' + (await util.fetchTag('plain_alias')).body)()",
                { msg }
            )
        ).resolves.toBe("plain:alpha body");

        await expect(
            vm.runScript(
                "(async () => (await util.fetchTag('plain_alias', true)).name + ':' + (await util.fetchTag('plain_alias', true)).body)()",
                { msg }
            )
        ).resolves.toBe("plain_alias:alpha body");

        await expect(
            vm.runScript(
                "(async () => (await util.fetchTag('plain_alias', { aliasOriginal: true })).name + ':' + (await util.fetchTag('plain_alias', { aliasOriginal: true })).body)()",
                { msg }
            )
        ).resolves.toBe("plain_alias:alpha body");

        await expect(
            vm.runScript("(async () => (await util.dumpTags(true)).find(tag => tag.name === 'scripted').type)()", {
                msg
            })
        ).resolves.toBe("3");

        await expect(vm.runScript("util.executeTag('plain')", { msg })).resolves.toBe("alpha body");

        await expect(vm.runScript("util.executeTag('scripted', ['left', 'right'])", { msg })).resolves.toBe(
            "scripted:left right "
        );

        await expect(vm.runScript("util.executeTagSafe('scripted_timer', ['left', 'right'])", { msg })).resolves.toBe(
            "scripted_timer:left right"
        );

        await expect(vm.runScript("util.executeTag('scripted_undefined')", { msg })).resolves.toBe("true");

        await expect(vm.runScript("util.executeTag('missing')", { msg })).rejects.toThrow("Tag missing doesn't exist");
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
            vm.runScript(
                "(async () => (await util.fetchMessage('user-1', 'fallback-default', 'channel-hit', 'msg-1')).content)()",
                { msg }
            )
        ).resolves.toBe("fetched body");

        await expect(
            vm.runScript(
                "(async () => (await util.fetchMessage('user-1', 'fallback-default', null, 'msg-1')).content)()",
                { msg }
            )
        ).resolves.toBe("fetched body");

        runtime.client.fetchMessage = async () => null;

        await expect(
            vm.runScript(
                "(async () => (await util.fetchMessage('user-1', 'fallback-default', null, 'msg-1')) === null)()",
                { msg }
            )
        ).resolves.toBe("true");

        await expect(
            vm.runScript(
                "(async () => (await util.fetchMessages('user-1', 'fallback-default', 'missing-channel', {})).map(msg => msg.content).join(','))()",
                { msg }
            )
        ).resolves.toBe("fallback-1,fallback-2");

        await expect(
            vm.runScript("(async () => (await util.findUserById('abc')).globalName)()", { msg })
        ).resolves.toBe("global-abc");

        await expect(
            vm.runScript(
                "(async () => (await util.findUsers('alpha'))[0].displayName + ':' + (await util.findUsers('alpha'))[0].roles[0])()",
                { msg }
            )
        ).resolves.toBe("display-alpha:role-1");
    });

    test("processes reply payloads directly", () => {
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

        expect(vm._processReply('{"content":"plain"}')).toEqual({
            content: "plain"
        });
    });

    test("rewrites stack trace on script compilation error to avoid leaking host stack", async () => {
        const msg = createDiscordMessage("hello");

        let thrownErr;

        try {
            await vm.runScript("function(", { msg });
        } catch (err) {
            thrownErr = err;
        }

        expect(thrownErr).toBeDefined();
        expect(thrownErr.name).toBe("SyntaxError");
        expect(thrownErr.stack).not.toContain("EvalContext._compileScript");
        expect(thrownErr.stack).not.toContain("TagVM.runScript");
    });

    test("rewrites stack trace on script timeout to avoid leaking host stack", async () => {
        const msg = createDiscordMessage("hello");

        let thrownErr;

        try {
            await vm.runScript("while(true) {}", { msg });
        } catch (err) {
            thrownErr = err;
        }

        expect(thrownErr).toBeDefined();
        expect(thrownErr.name).toBe("VMError");
        expect(thrownErr.message).toBe("Script execution timed out");
        expect(thrownErr.stack).toBe("VMError: Script execution timed out");
        expect(thrownErr.stack).not.toContain("TagVM._handleScriptError");
        expect(thrownErr.stack).not.toContain("TagVM.runScript");
    });
});
