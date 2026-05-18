import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Buffer } from "node:buffer";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let Tag;
let TagTypes;
let TagBitField;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    ({ default: Tag } = await import("../../../src/structures/tag/Tag.js"));
    ({ TagTypes } = await import("../../../src/structures/tag/TagTypes.js"));
    ({ default: TagBitField } = await import("../../../src/structures/tag/TagBitField.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("Tag", () => {
    test("validates flag helpers and tag types", () => {
        expect(Tag.getFlag("script").toNumber()).toBeGreaterThan(0);
        expect(Tag.getFlag([false, "script"]).toNumber()).toBeLessThan(0);
        expect(TagBitField.is(Tag.getFlag("script"))).toBe(true);
        expect(TagBitField.isFilter(Tag.getFlag([false, "script"]))).toBe(true);
        expect(TagBitField.query(Tag.getFlag([false, "script"]))).toEqual({
            $flag: -2
        });
        expect(() => Tag.getFlag("unknown")).toThrow("Unknown flag");

        const tag = new Tag({ name: "x", body: "x" });
        expect(Tag.from(tag)).toBe(tag);
        expect(Tag.from(null, true)).toBe(null);
        expect(() => tag.setType(["a", "b", "c"])).toThrow("Invalid type");
        expect(() => new Tag({ name: "x", body: "x", type: "unknown" })).toThrow("Unknown type");
        expect(() => tag.setType(["text", "unknown"])).toThrow("Unknown version");

        const numeric = new Tag({ name: "numeric", body: "x", type: 3 });
        expect(typeof numeric.type).toBe("object");
        expect(numeric.type.toNumber()).toBe(3);
        expect(numeric.getData().type).toBe(3);
        expect(numeric.getData("$").$type).toEqual(Buffer.from([3]));

        const blob = new Tag({ name: "blob", body: "x", type: Buffer.from([6]) });
        expect(blob.getType()).toBe("vm2");
        expect(blob.isOld).toBe(true);
        expect(blob.isVm2).toBe(true);
        blob.unsetVm2();
        expect(blob.isVm2).toBe(false);
        expect(blob.isScript).toBe(true);

        const toggled = new Tag({ name: "toggle", body: "x" });
        toggled.setVm2();
        expect(toggled.isScript).toBe(true);
        expect(toggled.isVm2).toBe(true);

        expect(() => new Tag({ name: "bad", body: "x", type: Buffer.from([4]) })).toThrow("Invalid type");
        expect(() => new Tag({ name: "wide", body: "x", type: Buffer.from([1, 2]) })).toThrow("Invalid type");
    });

    test("validates tag bitfield candidates before commit", () => {
        const type = TagBitField.from(6);

        expect(() => type.set(1, false)).toThrow("Invalid type");
        expect(type.toNumber()).toBe(6);
        expect(type.get(1)).toBe(true);
        expect(type.get(2)).toBe(true);

        expect(() => TagBitField.from(6).setAll([false], 1)).toThrow("Invalid type");
        expect(() => TagBitField.from(Buffer.from([4]))).toThrow("Invalid type");
        expect(TagBitField.filter(-2).invert).toBe(true);
    });

    test("setType(text) clears script flags", () => {
        const tag = new Tag({ name: "script", body: "return 1", type: "ivm" });

        expect(tag.isScript).toBe(true);
        tag.setType(TagTypes.defaults.type);

        expect(tag.isScript).toBe(false);
        expect(tag.getType()).toBe(TagTypes.defaults.type);
    });

    test("aliases to script tags are stored as text aliases", () => {
        const target = new Tag({ name: "target", body: "return 1", type: "ivm" });
        const alias = new Tag({ name: "alias", type: "ivm" });

        alias.aliasTo(target);

        expect(alias.isAlias).toBe(true);
        expect(alias.isScript).toBe(false);
        expect(alias.getType()).toBe(TagTypes.defaults.type);
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
        runtime.client.findUserById = id =>
            id === "found"
                ? {
                      user: { username: "alice" },
                      nickname: "ally"
                  }
                : null;
        runtime.client.findUsers = () => [
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
        expect(plain.setBody("next", TagTypes.defaults.type)).toBe(true);
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
