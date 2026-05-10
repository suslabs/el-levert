import { afterEach, beforeEach, describe, expect, test } from "vitest";
import createHttpStubServer from "../../helpers/httpStubServer.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let Tag;
let TagError;
let TagManager;
let managers;
let servers;

async function createManager(enabled = true) {
    const manager = new TagManager(enabled);
    managers.push(manager);

    if (enabled) {
        await manager.load();
    }

    return manager;
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    TagManager = (await import("../../../src/managers/database/TagManager.js")).default;
    TagError = (await import("../../../src/errors/TagError.js")).default;
    Tag = (await import("../../../src/structures/tag/Tag.js")).default;

    managers = [];
    servers = [];

    runtime.client.checkComponent = (_family, name) => ({
        runScript: (body, values) => `${name}:${body}:${values.args}:${values.tag.name}`
    });
    runtime.client.findUserById = id => {
        if (id === "u9") {
            return Promise.reject(new Error("missing"));
        }

        return Promise.resolve({ id, username: `name-${id}` });
    };
});

afterEach(async () => {
    for (const manager of managers) {
        await manager?.unload?.();
    }

    for (const server of servers) {
        await server.close();
    }

    await cleanupRuntime(runtime);
});

describe("TagManager", () => {
    test("loads a real sqlite database and covers the main tag lifecycle", async () => {
        const manager = await createManager();

        const plain = await manager.add("plain", "alpha beta", "u1", "text");
        await manager.add("legacy", "old body", "u1", "old");
        const ivmTag = await manager.add("script_ivm", "return args", "u2", "ivm");
        const vm2Tag = await manager.add("script_vm2", "return args", "u2", "vm2");
        await manager.add("roll1", "dice one", "u3", "text");
        await manager.add("roll2", "dice two", "u3", "text");

        const [alias, created] = await manager.alias(null, plain, "extra", {
            name: "plain_alias",
            owner: "u1"
        });

        expect(created).toBe(true);
        expect(alias.isAlias).toBe(true);
        expect(await manager.execute(await manager.fetch("plain_alias"), "ignored")).toBe("alpha beta");
        expect(await manager.execute(ivmTag, "run", { extra: 1 })).toBe("tagVM:return args:run:script_ivm");
        expect(await manager.execute(vm2Tag, "again", { extra: 2 })).toBe("tagVM2:return args:again:script_vm2");

        await manager.edit(await manager.fetch("plain"), "alpha gamma", "text", true);
        await manager.updateProps(
            "plain",
            new Tag({
                name: "plain_renamed",
                body: "moved body",
                owner: "u9",
                type: "text"
            }),
            true
        );

        expect(await manager.count()).toBe(7);
        expect(await manager.count("u1")).toBe(2);
        expect(await manager.tag_db.quotaCountFetch("u1")).toBe(2);
        expect(await manager.tag_db.quotaCountFetch("u9")).toBe(1);
        expect(await manager.tag_db.usageFetch("plain_alias")).toBe(1);
        expect(await manager.tag_db.usageFetch("script_ivm")).toBe(1);
        expect(await manager.tag_db.usageFetch("script_vm2")).toBe(1);
        expect(await manager.tag_db.usageFetch("plain")).toBeNull();
        expect(await manager.tag_db.usageFetch("plain_renamed")).toBe(0);
        expect(await manager.search("plain", 5, 0)).toMatchObject({
            results: expect.arrayContaining(["plain_alias", "plain_renamed"])
        });
        expect(await manager.fullSearch("moved", 10)).toMatchObject({
            other: {
                hasInfo: true
            }
        });

        const sizeLeaderboard = await manager.leaderboard("size", 10);
        expect(sizeLeaderboard.some(entry => entry.user.username === "NOT FOUND")).toBe(true);

        await manager.execute(await manager.fetch("roll1"), "");
        await manager.delete(await manager.fetch("roll1"));
        expect(await manager.count("u3")).toBe(1);
        expect(await manager.tag_db.usageFetch("roll1")).toBe(1);

        const usageLeaderboard = await manager.leaderboard("usage", 10);
        expect(usageLeaderboard).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "plain_alias", count: 1, exists: true }),
                expect.objectContaining({ name: "roll1", count: 1, exists: false })
            ])
        );
    });

    test("checks tag existence for single and multiple names", async () => {
        const manager = await createManager();

        await manager.add("alpha", "body", "u1", "text");
        await manager.add("beta", "body", "u1", "text");

        expect(await manager.exists("alpha")).toBe(true);
        expect(await manager.exists("missing")).toBe(false);
        expect(await manager.exists(["alpha", "missing", "beta"])).toEqual([true, false, true]);
        await expect(manager.exists(["alpha", "bad name"], true)).rejects.toThrow("must consist");
    });

    test("treats uncertain public string inputs as absent instead of using generic length semantics", async () => {
        const manager = await createManager();

        await manager.add("alpha", "body", "u1", "text");
        await manager.add("beta", "body", "u2", "text");
        await manager.add("script", "return args", "u1", "ivm");

        expect(await manager.count({ length: 1 })).toBe(3);
        expect(await manager.random({ length: 1 })).toMatch(/^(alpha|beta|script)$/);
        expect(await manager.execute(await manager.fetch("script"), ["bad"])).toBe("tagVM:return args::script");
    });

    test("routes alias usage down the chain until it hits bound args or the final target", async () => {
        const manager = await createManager();

        const target = await manager.add("target", "body", "u1", "text");
        const [direct] = await manager.alias(null, target, "", {
            name: "direct",
            owner: "u1"
        });
        const [bound] = await manager.alias(null, target, "fixed", {
            name: "bound",
            owner: "u1"
        });
        const [passthrough] = await manager.alias(null, bound, "", {
            name: "passthrough",
            owner: "u1"
        });

        await manager.execute(direct, "runtime");
        await manager.execute(bound, "runtime");
        await manager.execute(passthrough, "runtime");

        expect(await manager.tag_db.usageFetch("target")).toBe(1);
        expect(await manager.tag_db.usageFetch("direct")).toBe(0);
        expect(await manager.tag_db.usageFetch("bound")).toBe(2);
        expect(await manager.tag_db.usageFetch("passthrough")).toBe(0);
    });

    test("covers validation and stale-row error paths against the real database", async () => {
        const manager = await createManager();

        expect(manager.checkName("bad name", false)).toEqual([null, expect.stringContaining("must consist")]);
        expect(manager.checkBody("", false)).toEqual([null, "Tag body is empty"]);
        await expect(manager.fetch("missing", true)).rejects.toThrow("Tag doesn't exist");
        expect(() => new Tag({ name: "bad", body: "body", owner: "u", type: "weird" })).toThrow("Unknown type: weird");

        const tag = await manager.add("same", "body", "u1", "text");
        await expect(manager.add("same", "body", "u1", "text")).rejects.toThrow("Tag already exists");
        await expect(manager.edit(tag, "body", "text", true)).rejects.toThrow("same body");

        await manager.tag_db.quotaCreate("u5");
        await manager.tag_db.add(new Tag({ name: "orphan", owner: "u5", aliasName: "missing" }));
        await expect(manager.fetchAlias(await manager.fetch("orphan"))).rejects.toThrow("Hop not found");

        const stale = new Tag({ name: "stale", body: "old", owner: "u5" });
        await expect(manager.delete(stale, true)).rejects.toThrow("Tag doesn't exist");
        await expect(manager.leaderboard("invalid")).rejects.toThrow("Invalid leaderboard type");
    });

    test("handles attachment download paths and size errors through the real HTTP helper", async () => {
        const manager = await createManager();
        const plainServer = await createHttpStubServer({
            "/plain.txt": () => ({
                headers: {
                    "content-type": "text/plain"
                },
                body: "plain file"
            }),
            "/script.js": () => ({
                headers: {
                    "content-type": "application/javascript"
                },
                body: "console.log(1);"
            })
        });
        servers.push(plainServer);

        await expect(
            manager.downloadBody(
                "args",
                {
                    attachments: [{ url: `${plainServer.url}/plain.txt`, contentType: "text/plain", size: 1 }]
                },
                "tag"
            )
        ).resolves.toEqual({
            body: "plain file",
            isScript: false
        });

        await expect(
            manager.downloadBody(
                "args",
                {
                    attachments: [
                        { url: `${plainServer.url}/script.js`, contentType: "application/javascript", size: 1 }
                    ]
                },
                "eval"
            )
        ).resolves.toEqual({
            body: "console.log(1);",
            isScript: true
        });

        await expect(
            manager.downloadBody("prefix", { attachments: [{ url: `${plainServer.url}/plain.txt` }] }, "tag")
        ).rejects.toThrow("Attachment doesn't have a content type");

        await expect(
            manager.downloadBody(
                "",
                {
                    attachments: [{ url: `${plainServer.url}/plain.txt`, contentType: "text/plain", size: 9999999 }]
                },
                "tag"
            )
        ).rejects.toThrow("Tags can take up at most");

        await expect(manager.downloadBody("", { attachments: [] }, "invalid")).rejects.toThrow("Invalid body type");
        expect(TagError).toBeDefined();
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let TagManager;
    let managers;

    async function createManager() {
        const manager = new TagManager(true);
        managers.push(manager);

        await manager.load();
        return manager;
    }

    beforeEach(async () => {
        runtime = await createRuntime({
            loadManagers: false,
            loadVMs: false
        });

        TagManager = (await import("../../../src/managers/database/TagManager.js")).default;
        managers = [];
    });

    afterEach(async () => {
        for (const manager of managers) {
            await manager?.unload?.();
        }

        await cleanupRuntime(runtime);
        runtime = null;
    });

    describe("TagManager branch coverage", () => {
        test("covers alias validation, recursion, and random lookup branches", async () => {
            const manager = await createManager();
            const alpha = await manager.add("alpha", "alpha body", "u1", "text");
            const beta = await manager.add("beta", "beta body", "u2", "text");

            await expect(manager.alias(null, null)).rejects.toThrow("Alias target doesn't exist");
            await expect(manager.alias(null, alpha, "", null)).rejects.toThrow("No info for creating the tag provided");
            await expect(manager.rename(alpha, "alpha", true)).rejects.toThrow("same name");
            await expect(manager.rename(beta, "alpha", true)).rejects.toThrow("Tag already exists");
            await expect(manager.random("bad name", true)).rejects.toThrow("must consist of Latin characters");

            await manager.add("dice1", "one", "u3", "text");
            await manager.add("dice2", "two", "u3", "text");

            expect(await manager.random("dice", true)).toMatch(/^dice[12]$/);
            expect(await manager.random("")).not.toBeNull();

            const [alphaAlias] = await manager.alias(alpha, beta, "x");
            await expect(manager.alias(alphaAlias, beta, "x")).rejects.toThrow("same target and args");

            const [loopA] = await manager.alias(await manager.fetch("alpha"), await manager.fetch("beta"), "");
            const [loopB] = await manager.alias(await manager.fetch("beta"), loopA, "");

            await expect(manager.fetchAlias(loopB)).rejects.toThrow("Tag recursion detected");
        });

        test("falls back to attachment urls when file validation rejects the upload", async () => {
            const manager = await createManager();
            const out = await manager.downloadBody(
                "prefix",
                {
                    attachments: [
                        {
                            url: "https://example.com/file.png",
                            contentType: "image/png"
                        }
                    ]
                },
                "tag"
            );

            expect(out).toEqual({
                body: "prefix https://example.com/file.png",
                isScript: false
            });
        });
    });
});
