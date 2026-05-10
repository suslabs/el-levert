import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import TagDatabase from "../../src/database/TagDatabase.js";
import OpenModes from "../../src/database/drivers/sqlite/OpenModes.js";
import Tag from "../../src/structures/tag/Tag.js";

const queryPath = path.resolve(projRoot, "src/database/query/tag");

let tempDir;

function createDb(filename = "tags.sqlite") {
    const dbPath = path.join(tempDir, filename);
    return new TagDatabase(dbPath, queryPath, { enableWAL: false });
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-db-"));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("TagDatabase", () => {
    test("covers current-schema CRUD, quotas, counts, dumps, leaderboards, and prefix search", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        await db.quotaCreate("u1");
        await db.quotaCreate("u2");
        await db.quotaSet("u1", 4.5);
        await db.quotaSet("u2", 2.5);
        await db.quotaCountSet("u1", 0);
        await db.quotaCountSet("u2", 0);

        const plain = new Tag({ name: "plain", body: "body", owner: "u1" });
        const alias = new Tag({ name: "alias", owner: "u1" });
        alias.aliasTo(plain, "extra");

        const script = new Tag({ name: "script1", body: "console.log(1)", owner: "u2", type: "ivm" });
        const legacy = new Tag({ name: "legacy", body: "old", owner: "u1", type: "old" });

        await db.add(plain);
        await db.add(alias);
        await db.add(script);
        await db.add(legacy);
        expect(await db.usageFetch("plain")).toBe(0);
        await db.usageIncrement("plain");
        await db.usageIncrement("plain");
        expect(await db.usageFetch("plain")).toBe(2);
        expect(await db.usageLeaderboard(5)).toEqual([
            expect.objectContaining({ name: "plain", count: 2 })
        ]);

        expect(await db.fetch("missing")).toBeNull();
        expect(await db.fetch("plain")).toMatchObject({ body: "body", owner: "u1" });

        await db.edit(new Tag({ name: "plain", body: "updated", owner: "u1", type: "text" }));
        expect(await db.fetch("plain")).toMatchObject({ body: "updated" });

        await db.updateProps(
            "plain",
            new Tag({
                name: "plain2",
                body: "moved",
                owner: "u2",
                args: "args",
                type: "vm2"
            })
        );
        expect(await db.fetch("plain")).toBeNull();
        expect(await db.fetch("plain2")).toMatchObject({ body: "moved", owner: "u2", args: "args" });
        expect(await db.usageFetch("plain")).toBeNull();
        expect(await db.usageFetch("plain2")).toBe(2);

        const fetchedLegacy = await db.fetch("legacy");
        await db.chown(fetchedLegacy, "u2");
        expect(await db.fetch("legacy")).toMatchObject({ owner: "u2" });

        const fetchedAlias = await db.fetch("alias");
        await db.rename(fetchedAlias, "alias2");
        expect(await db.fetch("alias")).toBeNull();
        expect(await db.fetch("alias2")).toMatchObject({ aliasName: "plain" });
        expect(await db.usageFetch("alias")).toBeNull();
        expect(await db.usageFetch("alias2")).toBe(0);

        await db.updateAliases("plain", "plain2");
        expect(await db.fetch("alias2")).toMatchObject({ aliasName: "plain2" });

        expect(await db.dump()).toEqual(["alias2", "legacy", "plain2", "script1"]);
        expect(await db.dump(Tag.getFlag([false, "script"]))).toEqual(["alias2", "legacy"]);
        expect((await db.fullDump()).map(tag => tag.name)).toEqual(["alias2", "legacy", "plain2", "script1"]);
        expect(await db.searchWithPrefix("pl")).toEqual(["plain2"]);
        expect((await db.list("u2")).map(tag => tag.name)).toEqual(["legacy", "plain2", "script1"]);

        await db.quotaCountSet("u1", 1);
        await db.quotaCountSet("u2", 3);

        expect(await db.count()).toBe(4);
        expect(await db.count("u2")).toBe(3);
        expect(await db.count("u2", Tag.getFlag("script"))).toBe(2);
        expect(await db.count("u2", Tag.getFlag([false, "new"]))).toBe(0);

        expect(await db.countLeaderboard(5)).toEqual([
            expect.objectContaining({ user: "u2", count: 3 }),
            expect.objectContaining({ user: "u1", count: 1 })
        ]);

        expect(await db.quotaFetch("missing")).toBeNull();
        expect(await db.quotaFetch("u1")).toBe(4.5);
        expect(await db.quotaCountFetch("u1")).toBe(1);
        expect(await db.sizeLeaderboard(5)).toEqual([
            expect.objectContaining({ user: "u1", quota: 4.5 }),
            expect.objectContaining({ user: "u2", quota: 2.5 })
        ]);

        await db.delete(await db.fetch("script1"));
        expect(await db.fetch("script1")).toBeNull();
        expect(await db.usageFetch("script1")).toBe(0);

        await db.delete(await db.fetch("plain2"));
        expect(await db.usageFetch("plain2")).toBe(2);

        await db.add(new Tag({ name: "plain2", body: "restored", owner: "u2" }));
        expect(await db.usageFetch("plain2")).toBe(2);

        await db.open(OpenModes.OPEN_READWRITE);
        await db.close();
    });

    test("checks tag existence for single and multiple names without fetching full tags", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        await db.add(new Tag({ name: "alpha", body: "body", owner: "u1" }));
        await db.add(new Tag({ name: "beta", body: "body", owner: "u1" }));

        expect(await db.exists("alpha")).toBe(true);
        expect(await db.exists("missing")).toBe(false);
        expect(await db.exists(["alpha", "missing", "beta"])).toEqual([true, false, true]);
        expect(await db.exists([])).toEqual([]);

        await db.close();
    });

    test("uses cached quota counts for unfiltered user counts", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        await db.quotaCreate("u1");
        await db.quotaCreate("u2");
        await db.quotaCountSet("u1", 99);
        await db.quotaCountSet("u2", 5);

        await db.add(new Tag({ name: "alpha", body: "body", owner: "u1" }));
        await db.add(new Tag({ name: "script1", body: "console.log(1)", owner: "u1", type: "ivm" }));
        await db.add(new Tag({ name: "beta", body: "body", owner: "u2" }));

        expect(await db.count("u1")).toBe(99);
        expect(await db.count("u1", Tag.getFlag("script"))).toBe(1);
        expect(await db.countLeaderboard(5)).toEqual([
            expect.objectContaining({ user: "u1", count: 99 }),
            expect.objectContaining({ user: "u2", count: 5 })
        ]);

        await db.close();
    });

    test("stores empty aliasName and args as null but initializes tags with empty strings", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        const tag = new Tag({ name: "plain", body: "body", owner: "user" });
        await db.add(tag);

        const raw = await db.db.get("SELECT aliasName, args FROM Tags WHERE name = $name", {
            $name: "plain"
        });
        expect(raw.aliasName).toBeNull();
        expect(raw.args).toBeNull();

        const fetched = await db.fetch("plain");
        expect(fetched.aliasName).toBe("");
        expect(fetched.args).toBe("");

        await db.close();
    });

    test("writes scalar aliasName and resolves alias rows from a fresh database", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        const target = new Tag({ name: "target", body: "body", owner: "user" });
        const alias = new Tag({ name: "alias", owner: "user" });
        alias.aliasTo(target, "extra");

        await db.add(target);
        await db.add(alias);

        const raw = await db.db.get("SELECT aliasName, args FROM Tags WHERE name = $name", {
            $name: "alias"
        });
        expect(raw.aliasName).toBe("target");
        expect(raw.args).toBe("extra");

        const fetched = await db.fetch("alias");
        expect(fetched.aliasName).toBe("target");
        expect(fetched.hops).toEqual(["alias", "target"]);

        await db.close();
    });

    test("reads old hops rows and scalarizes alias writes on an unmigrated database", async () => {
        const db = createDb();
        await db.open(OpenModes.OPEN_RWCREATE);
        await db.db.exec(`
            CREATE TABLE 'Quotas' (
                'user' TEXT,
                'quota' REAL,
                'count' INTEGER,
                PRIMARY KEY('user')
            ) STRICT;
            CREATE TABLE 'Tags' (
                'hops' TEXT,
                'name' TEXT,
                'body' TEXT,
                'owner' TEXT,
                'args' TEXT,
                'registered' INTEGER,
                'lastEdited' INTEGER,
                'type' INTEGER,
                PRIMARY KEY('name')
            ) STRICT;
            CREATE TABLE 'Usage' (
                'name' TEXT,
                'count' INTEGER,
                PRIMARY KEY('name')
            ) STRICT;
        `);
        await db.load();

        await db.db.run("INSERT INTO Tags VALUES ($hops, $name, $body, $owner, $args, 0, 0, 1);", {
            $hops: "legacy,target,final",
            $name: "legacy",
            $body: "",
            $owner: "user",
            $args: null
        });

        const legacy = await db.fetch("legacy");
        expect(legacy.aliasName).toBe("target");
        expect(legacy.hops).toEqual(["legacy", "target"]);

        const target = new Tag({ name: "new_alias", body: "", owner: "user", aliasName: "target" });
        await db.add(target);

        let raw = await db.db.get("SELECT hops FROM Tags WHERE name = $name", {
            $name: "new_alias"
        });
        expect(raw.hops).toBe("target");
        expect(await db.fetch("new_alias")).toMatchObject({ aliasName: "target" });

        await db.updateAliases("target", "renamed");

        raw = await db.db.get("SELECT hops FROM Tags WHERE name = $name", {
            $name: "legacy"
        });
        expect(raw.hops).toBe("renamed");

        raw = await db.db.get("SELECT hops FROM Tags WHERE name = $name", {
            $name: "new_alias"
        });
        expect(raw.hops).toBe("renamed");

        await db.close();
    });
});
