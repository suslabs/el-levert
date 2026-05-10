import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, addAdmin, addTag, executeCommand } from "../../helpers/commandHarness.js";
import ClientError from "../../../src/errors/ClientError.js";
import TagError from "../../../src/errors/TagError.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadHandlers: true
    });
    msg = createCommandMessage("%tag", {
        author: {
            id: "user-1",
            username: "alex"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag command", () => {
    test("runs through the real command and preview path", async () => {
        const command = getCommand(runtime, "tag");

        expect(await command.parseBase("ivm ```js\nreturn 1;\n```", null)).toMatchObject({
            body: "return 1;",
            type: "ivm",
            err: null
        });

        await expect(executeCommand(command, "", { msg })).resolves.toContain("add|alias|chown");
        await expect(executeCommand(command, "bad*", { msg })).resolves.toContain("must consist");

        await expect(executeCommand(command, "add alpha body one", { msg })).resolves.toContain("Created tag **alpha**");
        await expect(executeCommand(command, "add alpine body two", { msg })).resolves.toContain("Created tag **alpine**");

        await expect(executeCommand(command, "alpha", { msg })).resolves.toEqual([
            "body one",
            {
                type: "options",
                useConfigLimits: true
            }
        ]);

        const missing = await executeCommand(command, "alpah", { msg });
        expect(missing).toContain("doesn't exist");
        expect(missing).toContain("Did you mean:");
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let command;
    let userMsg;
    let adminMsg;
    let guildMsg;

    async function run(args, msg = userMsg) {
        return await executeCommand(command, args, {
            msg
        });
    }

    beforeEach(async () => {
        runtime = await createCommandRuntime({
            loadVMs: false,
            loadHandlers: true
        });

        command = getCommand(runtime, "tag");

        await addAdmin(runtime);

        userMsg = createCommandMessage("%tag", {
            author: {
                id: "user-1",
                username: "alex"
            }
        });

        adminMsg = createCommandMessage("%tag", {
            author: {
                id: "admin-user",
                username: "admin"
            }
        });

        guildMsg = createCommandMessage("%tag", {
            author: {
                id: "user-1",
                username: "alex"
            },
            guild: {
                id: "guild-1"
            }
        });
    }, 30000);

    afterEach(async () => {
        vi.restoreAllMocks();
        await cleanupRuntime(runtime);
    }, 30000);

    describe("tag command branches", () => {
        test("covers parseBase text, empty, and attachment error branches", async () => {
            expect(await command.parseBase("", null)).toMatchObject({
                body: null,
                type: null,
                err: ":warning: Tag body is empty."
            });

            expect(await command.parseBase("ivm ```js\nreturn 1;\n```", null)).toMatchObject({
                body: "return 1;",
                type: "ivm",
                err: null
            });

            vi.spyOn(runtime.client.tagManager, "downloadBody").mockRejectedValueOnce(new TagError("Attachment rejected"));
            expect(
                await command.parseBase("ignored", {
                    attachments: new Map([["file", {}]])
                })
            ).toMatchObject({
                err: ":warning: Attachment rejected."
            });

            const downloadErr = new Error("network");
            downloadErr.stack = "stack-trace";

            vi.spyOn(runtime.client.tagManager, "downloadBody").mockRejectedValueOnce(downloadErr);

            expect(
                await command.parseBase("ignored", {
                    attachments: new Map([["file", {}]])
                })
            ).toMatchObject({
                err: {
                    content: ":no_entry_sign: Downloading attachment failed:"
                }
            });
        });

        test("covers the main tag handler for missing tags, alias failures, execution failures, and preview branches", async () => {
            await addTag(runtime, "alpha", "body one");

            expect(await run("")).toContain("add|alias|chown");
            expect(await run("bad*")).toContain("must consist");

            const missing = await run("alpah");
            expect(missing).toContain("doesn't exist");
            expect(missing).toContain("Did you mean:");

            const aliasTag = {
                name: "loop",
                isAlias: true
            };

            vi.spyOn(runtime.client.tagManager, "fetch").mockResolvedValueOnce(aliasTag);
            vi.spyOn(runtime.client.tagManager, "fetchAlias").mockRejectedValueOnce(new TagError("Tag recursion detected", ["a", "b"]));
            expect(await run("loop")).toContain("Epic recursion fail");

            vi.spyOn(runtime.client.tagManager, "fetch").mockResolvedValueOnce(aliasTag);
            vi.spyOn(runtime.client.tagManager, "fetchAlias").mockRejectedValueOnce(new TagError("Hop not found", "missing"));
            expect(await run("loop")).toContain("Tag **missing** doesn't exist");

            vi.spyOn(runtime.client.tagManager, "fetch").mockResolvedValueOnce(aliasTag);
            vi.spyOn(runtime.client.tagManager, "fetchAlias").mockRejectedValueOnce(new TagError("Alias exploded"));
            expect(await run("loop")).toContain("Alias exploded");

            const alpha = await runtime.client.tagManager.fetch("alpha");

            vi.spyOn(runtime.client.tagManager, "execute").mockRejectedValueOnce(new TagError("Execution failed"));
            expect(await run("alpha")).toContain("Execution failed");

            vi.spyOn(runtime.client.tagManager, "execute").mockRejectedValueOnce(new ClientError("Sandbox refused"));
            expect(await run("alpha")).toContain("Can't execute script tag");

            vi.spyOn(runtime.client.tagManager, "execute").mockResolvedValueOnce("https://example.com/watch?v=1");
            vi.spyOn(runtime.client.previewHandler, "canPreview").mockReturnValueOnce(true);
            vi.spyOn(runtime.client.previewHandler, "generatePreview").mockResolvedValueOnce({
                title: "preview"
            });
            vi.spyOn(runtime.client.previewHandler, "removeLink").mockReturnValueOnce("");

            expect(await run("alpha")).toEqual([
                {
                    embeds: [
                        {
                            title: "preview"
                        }
                    ]
                },
                {
                    type: "options",
                    limitType: "none"
                }
            ]);

            vi.spyOn(runtime.client.tagManager, "fetch").mockResolvedValueOnce(alpha);
            vi.spyOn(runtime.client.tagManager, "execute").mockResolvedValueOnce("https://example.com/watch?v=2");
            vi.spyOn(runtime.client.previewHandler, "canPreview").mockReturnValueOnce(true);
            vi.spyOn(runtime.client.previewHandler, "generatePreview").mockRejectedValueOnce(new Error("Preview failed"));

            expect(await run("alpha")).toEqual([
                "https://example.com/watch?v=2",
                {
                    type: "options",
                    limitType: "none"
                }
            ]);
        });

        test("covers add and alias validation, ownership, success, and manager failures", async () => {
            expect(await run("add")).toContain("name body");
            expect(await run("add delete body")).toContain("is a __command__");
            expect(await run("add bad* body")).toContain("must consist");

            vi.spyOn(runtime.client.tagManager, "checkBody").mockReturnValueOnce([null, "Invalid tag body"]);
            expect(await run("add alpha body")).toContain("Invalid tag body");

            expect(await run("add alpha body")).toContain("Created tag **alpha**");
            expect(await run("add alpha body")).toContain("already exists");

            vi.spyOn(runtime.client.tagManager, "add").mockRejectedValueOnce(new TagError("Create failed"));
            expect(await run("add beta body")).toContain("Create failed");

            const takenErr = new TagError("Tag already exists", {
                getOwner: () => Promise.resolve("not found")
            });

            vi.spyOn(runtime.client.tagManager, "add").mockRejectedValueOnce(takenErr);
            expect(await run("add gamma body")).toContain("tag owner not found");

            vi.spyOn(runtime.client.tagManager, "add").mockRejectedValueOnce(new Error("storage offline"));
            await expect(run("add delta body")).rejects.toThrow("storage offline");

            await addTag(runtime, "target", "payload");
            await addTag(runtime, "locked", "payload", "user-2");

            expect(await run("alias")).toContain("name other_tag");
            expect(await run("alias add target")).toContain("is a __command__");
            expect(await run("alias aliasOnly")).toContain("Alias target must be specified");
            expect(await run("alias bad* target")).toContain("must consist");
            expect(await run("alias locked target")).toContain("only edit your own tags");
            expect(await run("alias fresh missing")).toContain("doesn't exist");
            expect(await run("alias fresh target extra args")).toContain("Created tag **fresh** and aliased");
            expect(await run("alias fresh target")).toContain(":white_check_mark: Aliased");

            vi.spyOn(runtime.client.tagManager, "alias").mockRejectedValueOnce(new TagError("Alias failed"));
            expect(await run("alias gamma target")).toContain("Alias failed");
        });

        test("covers chown, delete, edit, and rename ownership and failure branches", async () => {
            await addTag(runtime, "alpha", "body");
            await addTag(runtime, "locked", "body", "user-2");
            await addTag(runtime, "taken", "body", "user-2");

            expect(await run("chown")).toContain("name new_owner");
            expect(await run("chown add target")).toContain("is a __command__");
            expect(await run("chown alpha")).toContain("Invalid target user");

            runtime.client.findUsers = () => [];
            expect(await run("chown alpha ghost")).toContain("User `ghost` not found");

            runtime.client.findUsers = query => [
                {
                    id: `${query}-id`,
                    user: {
                        id: `${query}-id`,
                        username: query
                    }
                }
            ];

            expect(await run("chown missing alex")).toContain("doesn't exist");
            expect(await run("chown locked alex")).toContain("only edit your own tags");
            expect(await run("chown alpha alex")).toContain("Transferred tag **alpha**");

            await addTag(runtime, "owned", "body");
            vi.spyOn(runtime.client.tagManager, "chown").mockRejectedValueOnce(new TagError("Transfer failed"));
            expect(await run("chown owned alex")).toContain("Transfer failed");

            expect(await run("delete")).toContain("name");
            expect(await run("delete edit")).toContain("is a __command__");
            expect(await run("delete bad*")).toContain("must consist");
            expect(await run("delete missing")).toContain("doesn't exist");
            expect(await run("delete locked")).toContain("only delete your own tags");
            expect(await run("delete owned")).toContain("Deleted tag **owned**");

            await addTag(runtime, "beta", "body");
            vi.spyOn(runtime.client.tagManager, "delete").mockRejectedValueOnce(new TagError("Delete failed"));
            expect(await run("delete beta")).toContain("Delete failed");

            await addTag(runtime, "gamma", "body");
            expect(await run("edit")).toContain("name new_body");
            expect(await run("edit add value")).toContain("is a __command__");
            expect(await run("edit bad* value")).toContain("must consist");
            expect(await run("edit missing value")).toContain("doesn't exist");
            expect(await run("edit locked value")).toContain("only edit your own tags");

            vi.spyOn(runtime.client.tagManager, "checkBody").mockReturnValueOnce([null, "Invalid tag body"]);
            expect(await run("edit gamma value")).toContain("Invalid tag body");

            expect(await run("edit gamma new body")).toContain("Edited tag **gamma**");

            vi.spyOn(runtime.client.tagManager, "edit").mockRejectedValueOnce(new TagError("Edit failed"));
            expect(await run("edit gamma another body")).toContain("Edit failed");

            await addTag(runtime, "delta", "body");
            expect(await run("rename")).toContain("name new_name");
            expect(await run("rename add target")).toContain("is a __command__");
            expect(await run("rename bad* target")).toContain("must consist");
            expect(await run("rename delta")).toContain("Invalid tag name");
            expect(await run("rename missing omega")).toContain("doesn't exist");
            expect(await run("rename locked omega")).toContain("only rename your own tags");
            expect(await run("rename delta taken")).toContain("already exists");
            expect(await run("rename delta omega")).toContain("Renamed tag **delta** to **omega**");

            vi.spyOn(runtime.client.tagManager, "rename").mockRejectedValueOnce(new TagError("Rename failed"));
            expect(await run("rename omega sigma")).toContain("Rename failed");
        });

        test("covers info, raw, owner, and set_type output branches", async () => {
            await addTag(runtime, "alpha", "body");

            expect(await run("info", adminMsg)).toContain("name");
            expect(await run("info add", adminMsg)).toContain("is a __command__");
            expect(await run("info bad*", adminMsg)).toContain("must consist");
            expect(await run("info missing", adminMsg)).toContain("doesn't exist");

            const infoOut = await run("info alpha", adminMsg);
            expect(infoOut).toContain("Tag info for **alpha**");

            runtime.client.commandHandler.outCharLimit = 20;
            const infoFile = await run("info alpha raw", adminMsg);
            expect(infoFile).toMatchObject({
                content: ":information_source: Tag info for **alpha**:"
            });

            runtime.client.commandHandler.outCharLimit = 1900;

            expect(await run("raw")).toContain("name");
            expect(await run("raw add")).toContain("is a __command__");
            expect(await run("raw bad*")).toContain("must consist");
            expect(await run("raw missing")).toContain("doesn't exist");

            const rawOut = await run("raw alpha");
            expect(rawOut).toMatchObject({
                files: expect.any(Array)
            });

            expect(await run("owner")).toContain("name");
            expect(await run("owner add")).toContain("is a __command__");
            expect(await run("owner bad*")).toContain("must consist");
            expect(await run("owner missing")).toContain("doesn't exist");

            const tag = await runtime.client.tagManager.fetch("alpha");
            vi.spyOn(runtime.client.tagManager, "fetch").mockResolvedValueOnce(tag);
            vi.spyOn(tag, "getOwner")
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null);
            expect(await run("owner alpha", guildMsg)).toContain("Tag owner not found");

            vi.spyOn(runtime.client.tagManager, "fetch").mockResolvedValueOnce(tag);
            vi.spyOn(tag, "getOwner").mockResolvedValueOnce({
                user: {
                    username: "alex"
                },
                nickname: "ally"
            });
            expect(await run("owner alpha", guildMsg)).toContain("also known as **ally**");

            expect(await run("set_type alpha version new", adminMsg)).toContain("Updated tag **alpha**");

            vi.spyOn(runtime.client.tagManager, "updateProps").mockRejectedValueOnce(new TagError("Update props failed"));
            expect(await run("set_type alpha text", adminMsg)).toContain("Update props failed");
        });

        test("covers list, count, search, random, leaderboard, dump, and fullsearch branches", async () => {
            expect(await run("list")).toContain("You don't have any tags");

            runtime.client.findUsers = () => [];
            expect(await run("list ghost")).toContain("User `ghost` not found");
            expect(await run("count ghost")).toContain("User `ghost` not found");

            runtime.client.findUsers = query => [
                {
                    id: `${query}-id`,
                    user: {
                        id: `${query}-id`,
                        username: query
                    }
                }
            ];

            expect(await run("list ghost")).toContain("User `ghost` has **no** tags");

            vi.spyOn(runtime.client.tagManager, "list").mockResolvedValueOnce({
                count: 2,
                newTags: [
                    {
                        format: () => "alpha"
                    }
                ],
                oldTags: [
                    {
                        format: () => "beta"
                    }
                ]
            });

            expect(await run("list")).toMatchObject({
                content: ":information_source: You have the following tags:"
            });

            await addTag(runtime, "alpha", "body");
            await addTag(runtime, "scripted", "return 1;", "user-1", "ivm");

            expect(await run("count me")).toContain("You have");
            expect(await run("count all")).toContain("There are");
            expect(await run("count new")).toContain("new tags");
            expect(await run("count script")).toContain("script tag");
            expect(await run("count alex")).toContain("User `alex` has");

            expect(await run("search")).toContain("name [all/max_results]");
            expect(await run("search bad*")).toContain("must consist");
            expect(await run("search alpha nope")).toContain("Invalid number");

            vi.spyOn(runtime.client.tagManager, "search").mockResolvedValueOnce({
                results: [],
                other: {
                    oversized: false
                }
            });
            expect(await run("search alpha")).toContain("Found **no** similar tags");

            vi.spyOn(runtime.client.tagManager, "search").mockResolvedValueOnce({
                results: ["alpha", "alpine"],
                other: {
                    oversized: true
                }
            });
            expect(await run("search alpha 2")).toContain("Found **2+** similar tags");

            vi.spyOn(runtime.client.tagManager, "search").mockResolvedValueOnce({
                results: Array.from({
                    length: 41
                }, (_, i) => `tag-${i}`),
                other: {
                    oversized: false
                }
            });
            expect(await run("search alpha all")).toMatchObject({
                content: expect.stringContaining("Found **41** similar tags")
            });

            expect(await run("random")).toContain("prefix");
            expect(await run("random bad*")).toContain("must consist");

            vi.spyOn(runtime.client.tagManager, "random").mockResolvedValueOnce(null);
            expect(await run("random alp")).toContain("No** tags matching the prefix");

            vi.spyOn(runtime.client.tagManager, "random").mockResolvedValueOnce("alpha");
            const randomOut = await run("random alp");
            expect(randomOut).toEqual([
                "body",
                {
                    type: "options",
                    useConfigLimits: true
                }
            ]);

            expect(await run("leaderboard")).toContain("count/size/usage");
            expect(await run("leaderboard nope")).toContain("Invalid leaderboard type");
            expect(await run("leaderboard count nope")).toContain("Invalid limit");

            vi.spyOn(runtime.client.tagManager, "leaderboard").mockResolvedValueOnce([]);
            expect(await run("leaderboard count")).toContain("There are **no** tags registered");

            vi.spyOn(runtime.client.tagManager, "leaderboard").mockResolvedValueOnce([
                {
                    user: {
                        username: "alex"
                    },
                    count: 2
                }
            ]);

            expect(await run("leaderboard count 1")).toMatchObject({
                content: ":information_source: Tag count leaderboard:"
            });

            vi.spyOn(runtime.client.tagManager, "leaderboard").mockResolvedValueOnce([
                {
                    user: {
                        username: "alex"
                    },
                    quota: 1.5
                }
            ]);

            expect(await run("leaderboard size 1")).toMatchObject({
                content: ":information_source: Tag size leaderboard:"
            });

            vi.spyOn(runtime.client.tagManager, "leaderboard").mockResolvedValueOnce([
                {
                    name: "alpha",
                    count: 3,
                    exists: true
                },
                {
                    name: "beta",
                    count: 2,
                    exists: false
                }
            ]);

            expect(await run("leaderboard usage 2")).toMatchObject({
                content: ":information_source: Tag usage leaderboard:"
            });

            vi.spyOn(runtime.client.tagManager, "dump").mockResolvedValueOnce([]);
            expect(await run("dump")).toContain("There are **no** tags registered");

            vi.spyOn(runtime.client.tagManager, "dump").mockResolvedValueOnce([
                {
                    getData: () => ({
                        name: "alpha"
                    })
                }
            ]);
            expect(await run("dump full nope")).toContain("Invalid indentation");

            vi.spyOn(runtime.client.tagManager, "dump").mockResolvedValueOnce([
                {
                    getData: () => ({
                        name: "alpha"
                    })
                }
            ]);
            expect(await run("dump full 2")).toMatchObject({
                files: expect.any(Array)
            });

            vi.spyOn(runtime.client.tagManager, "dump").mockResolvedValueOnce(["alpha", "beta"]);
            expect(await run("dump inline")).toMatchObject({
                files: expect.any(Array)
            });

            expect(await run("fullsearch")).toContain("query [all/max_results]");
            expect(await run("fullsearch alpha nope")).toContain("Invalid number");

            vi.spyOn(runtime.client.tagManager, "fullSearch").mockResolvedValueOnce({
                results: [],
                ranges: [],
                other: {
                    oversized: false
                }
            });
            expect(await run("fullsearch alpha")).toContain("Found **no** similar tags");

            vi.spyOn(runtime.client.tagManager, "fullSearch").mockResolvedValueOnce({
                results: [
                    {
                        name: "alpha",
                        body: ""
                    }
                ],
                ranges: [[]],
                other: {
                    oversized: false
                }
            });

            expect(await run("fullsearch alpha")).toMatchObject({
                content: expect.stringContaining("Found **1** matching tag")
            });

            vi.spyOn(runtime.client.tagManager, "fullSearch").mockResolvedValueOnce({
                results: Array.from({
                    length: 17
                }, (_, i) => ({
                    name: `tag-${i}`,
                    body: "alpha beta gamma"
                })),
                ranges: Array.from({
                    length: 17
                }, () => [0, 5]),
                other: {
                    oversized: false
                }
            });

            expect(await run("fullsearch alpha all")).toMatchObject({
                content: expect.stringContaining("Found **17** matching tags")
            });

            vi.spyOn(runtime.client.tagManager, "fullSearch").mockResolvedValueOnce({
                results: Array.from({
                    length: 17
                }, (_, i) => ({
                    name: `tag-extra-${i}`,
                    body: "alpha beta gamma"
                })),
                ranges: Array.from({
                    length: 17
                }, () => [0, 5]),
                other: {
                    oversized: true
                }
            });

            const out = await run("fullsearch alpha all");

            expect(out.content).toContain("Found **17+** matching tags");
            expect(out.files).toHaveLength(1);
        });
    });
});
