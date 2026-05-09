import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let Tag;
let TagTypes;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    ({ default: Tag } = await import("../../../src/structures/tag/Tag.js"));
    ({ TagTypes } = await import("../../../src/structures/tag/TagTypes.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("Tag", () => {
    test("validates flag helpers and tag types", () => {
        expect(Tag.getFlag("script")).toBeGreaterThan(0);
        expect(Tag.getFlag([false, "script"])).toBeLessThan(0);
        expect(() => Tag.getFlag("unknown")).toThrow("Unknown flag");

        const tag = new Tag({ name: "x", body: "x" });
        expect(() => tag.setType(["a", "b", "c"])).toThrow("Invalid type");
        expect(() => new Tag({ name: "x", body: "x", type: "unknown" })).toThrow("Unknown type");
        expect(() => tag.setType(["text", "unknown"])).toThrow("Unknown version");
    });

    test("setType(text) clears script flags", () => {
        const tag = new Tag({ name: "script", body: "return 1", type: "ivm" });

        expect(tag.isScript).toBe(true);
        tag.setType(TagTypes.textType);

        expect(tag.isScript).toBe(false);
        expect(tag.getType()).toBe(TagTypes.textType);
    });

    test("aliases to script tags are stored as text aliases", () => {
        const target = new Tag({ name: "target", body: "return 1", type: "ivm" });
        const alias = new Tag({ name: "alias", type: "ivm" });

        alias.aliasTo(target);

        expect(alias.isAlias).toBe(true);
        expect(alias.isScript).toBe(false);
        expect(alias.getType()).toBe(TagTypes.textType);
    });

    test("normalizes legacy hops and prefixes serialized fields", () => {
        const alias = new Tag({ name: "alias", body: "", hops: "alias,target,final" });
        const plain = new Tag({ name: "plain", body: "body" });

        expect(alias.aliasName).toBe("target");
        expect(alias.hops).toEqual(["alias", "target"]);
        expect(alias.getData()).toEqual(expect.objectContaining({ aliasName: "target" }));
        expect(alias.getData()).not.toHaveProperty("hops");

        expect(plain.getData()).toEqual(
            expect.objectContaining({
                aliasName: null,
                args: null,
                name: "plain",
                body: "body"
            })
        );
        expect(plain.getData("", false)).toEqual(expect.objectContaining({ aliasName: "", args: "" }));
        expect(plain.getData("$")).toEqual(
            expect.objectContaining({
                $aliasName: null,
                $args: null,
                $name: "plain",
                $body: "body"
            })
        );
        expect(plain.getData("$", true, ["name", "args"])).toEqual({
            $name: "plain",
            $args: null
        });
    });

    test("reads legacy scalar hops aliases back as aliases", () => {
        const alias = new Tag({ name: "alias", body: "", hops: "target" });
        const bodyTag = new Tag({ name: "plain", body: "body", hops: "plain" });

        expect(alias.aliasName).toBe("target");
        expect(alias.hops).toEqual(["alias", "target"]);
        expect(bodyTag.aliasName).toBe("");
        expect(bodyTag.hops).toEqual(["plain"]);
    });

    test("formats owners, raw output, time info, and equality helpers", async () => {
        runtime.client.findUserById = async id =>
            id === "found"
                ? {
                      user: { username: "alice" },
                      nickname: "ally"
                  }
                : null;
        runtime.client.findUsers = async () => [
            {
                user: { username: "member" },
                nickname: "mem"
            }
        ];

        const plain = new Tag({
            name: "plain",
            body: "body",
            owner: "found",
            registered: 1,
            lastEdited: 2
        });

        expect(plain.setName("renamed")).toBe(true);
        expect(plain.setOwner("found")).toBe(true);
        expect(plain.setBody("next", TagTypes.textType)).toBe(true);
        expect(plain.getSize()).toBeGreaterThan(0);
        expect(await plain.getOwner()).toBe("alice(ally)");
        expect(await plain.getOwner(false)).toEqual({
            user: { username: "alice" },
            nickname: "ally"
        });
        expect(await new Tag({ name: "x", owner: "0" }).getOwner()).toBe("invalid");
        expect(await new Tag({ name: "x", owner: "missing" }).getOwner()).toBe("not found");
        expect(await new Tag({ name: "x", owner: "found" }).getOwner(true, true, "1")).toBe("member(mem)");

        expect(plain.format()).toBe("renamed");
        expect(plain.getRaw()).toBe("next");
        expect(plain.getRaw(true)).toMatchObject({ files: expect.any(Array) });
        expect(plain.getTimeInfo(true)).toEqual({
            registeredTimestamp: 1,
            lastEditedTimestamp: 2
        });
        expect(plain.getTimeInfo(false)).toEqual({
            registered: new Date(1).toUTCString(),
            lastEdited: new Date(2).toUTCString()
        });
        expect(await plain.getInfo()).toEqual(
            expect.objectContaining({
                name: "renamed",
                owner: "alice(ally)",
                type: "text"
            })
        );

        const same = new Tag({ name: "same", body: "next", owner: "found", type: "text" });
        const alias = new Tag({ name: "alias", aliasName: "renamed", args: "a b", type: "text" });
        alias._setAliasProps(["alias", "renamed"], ["a", "", "b"]);
        alias._setOriginalProps(plain);

        expect(alias.name).toBe("renamed");
        expect(alias.sameAlias(new Tag({ name: "other", aliasName: "renamed", type: "text" }))).toBe(true);
        expect(plain.sameBody(same)).toBe(true);
        expect(plain.sameType(same)).toBe(true);
        expect(plain.equivalent(same)).toBe(true);
        expect(plain.equals(same)).toBe(true);
    });

    test("formats script and alias raw output branches", () => {
        const script = new Tag({ name: "script", body: "console.log(1)", type: "ivm" });
        script.setType(["ivm", "new"]);
        expect(script.getVersion()).toBe("new");
        expect(() => script.setVersion("bad")).toThrow("Unknown version");
        expect(script.getRaw()).toContain("Script type is");
        expect(script.getRaw(true)).toMatchObject({
            content: expect.stringContaining("Script type is"),
            files: expect.any(Array)
        });

        const alias = new Tag({
            name: "alias",
            aliasName: "target",
            args: "x ".repeat(400),
            type: "text"
        });
        expect(alias.getRaw()).toContain("with args");
        expect(alias.getRaw(true)).toMatchObject({ files: expect.any(Array) });
        alias.args = "";
        expect(alias.getRaw(true)).toMatchObject({
            content: expect.stringContaining("alias of")
        });

        expect(() => alias.aliasTo(null)).toThrow("No target tag provided");
        expect(() => alias.setVersion("")).toThrow("Invalid version");
    });
});
