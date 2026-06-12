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
    test("bridges tag data to the tag type object", () => {
        const scriptFilter = Tag.getFlag("script"),
            excludedScriptFilter = Tag.getFlag([false, "script"]);

        expect(scriptFilter).toBeInstanceOf(TagBitField);
        expect(scriptFilter.isEmpty()).toBe(false);
        expect(excludedScriptFilter.include).toBe(false);
        expect(() => Tag.getFlag("unknown")).toThrow("Unknown flag");

        const tag = new Tag({ name: "x", body: "x" });
        expect(Tag.from(tag)).toBe(tag);
        expect(Tag.from(null, true)).toBe(null);
        expect(Tag.normalizeMeta({ type: "ivm", language: "typescript" })).toEqual({
            version: "new",
            type: "ivm",
            language: "ts"
        });
        expect(() => new Tag({ name: "x", body: "x", meta: "unknown" })).toThrow("Invalid tag meta");
        expect(() => tag.setMeta(null)).toThrow("Invalid tag meta");
        expect(() => new Tag({ name: "x", body: "x", meta: { type: "unknown" } })).toThrow("Unknown type");
        expect(() => tag.setMeta({ type: "text", version: "unknown" })).toThrow("Unknown version");

        const stored = new Tag({ name: "stored", body: "x", type: Buffer.from([3]) });
        expect(stored.type).toBeInstanceOf(TagBitField);
        expect(stored.getData().type).toBe("03");
        expect(stored.getData("$").$type).toEqual(Buffer.from([3]));
    });

    test("delegates script type changes to the tag type object", () => {
        const tag = new Tag({ name: "script", body: "return 1", meta: { type: "ivm" } });

        expect(tag.isScript).toBe(true);
        tag.setScriptLanguage("ts");
        expect(tag.getScriptLanguage()).toBe("ts");
        tag.setScriptType(TagTypes.defaults.type);

        expect(tag.isScript).toBe(false);
        expect(tag.getScriptLanguage()).toBeUndefined();
        expect(tag.getScriptType()).toBe(TagTypes.defaults.type);
    });

    test("keeps script language and generated accessors in sync", () => {
        const ts = new Tag({
            name: "ts",
            body: "const x: number = 1;",
            meta: {
                type: "ivm",
                language: "ts"
            }
        });

        expect(ts.getScriptType()).toBe("ivm");
        expect(ts.getScriptLanguage()).toBe("ts");
        expect(ts.isTs).toBe(true);
        expect(ts.getMeta()).toEqual({
            version: "new",
            type: "ivm",
            language: "ts"
        });

        ts.setScriptType("vm2");
        expect(ts.getScriptType()).toBe("vm2");
        expect(ts.getScriptLanguage()).toBe("ts");
        expect(ts.isScript).toBe(true);
        expect(ts.isVm2).toBe(true);
        ts.unsetVm2();
        expect(ts.getScriptType()).toBe("ivm");
        expect(() => ts.setScriptType("bad")).toThrow("Unknown type");
        expect(ts.getScriptType()).toBe("ivm");
        expect(ts.getScriptLanguage()).toBe("ts");

        ts.setMeta({
            type: "ivm",
            language: "typescript"
        });
        expect(ts.getScriptType()).toBe("ivm");
        expect(ts.getScriptLanguage()).toBe("ts");

        expect(() => ts.setMeta({ type: "ivm", language: "py" })).toThrow("Unsupported script language");
        expect(() => ts.setMeta({ type: "script" })).toThrow("Unknown type");
        expect(() => ts.setMeta({ type: "ts" })).toThrow("Unknown type");
    });

    test("aliases to script tags are stored as text aliases", () => {
        const target = new Tag({ name: "target", body: "return 1", meta: { type: "ivm" } });
        const alias = new Tag({ name: "alias", meta: { type: "ivm" } });

        alias.aliasTo(target);

        expect(alias.isAlias).toBe(true);
        expect(alias.isScript).toBe(false);
        expect(alias.getScriptType()).toBe(TagTypes.defaults.type);
    });

    test("normalizes hop input and prefixes serialized fields", () => {
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

    test("reads scalar hop aliases back as aliases", () => {
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
        expect(plain.setBody("next", { type: TagTypes.defaults.type })).toBe(true);
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
                type: "text",
                language: undefined,
                typeData: "01"
            })
        );

        const same = new Tag({ name: "same", body: "next", owner: "found", meta: { type: "text" } });
        const alias = new Tag({ name: "alias", aliasName: "renamed", args: "a b", meta: { type: "text" } });
        alias._setAliasProps(["alias", "renamed"], ["a", "", "b"]);
        alias._setOriginalProps(plain);

        expect(alias.name).toBe("renamed");
        expect(alias.sameAlias(new Tag({ name: "other", aliasName: "renamed", meta: { type: "text" } }))).toBe(true);
        expect(plain.sameBody(same)).toBe(true);
        expect(plain.sameType(same)).toBe(true);
        expect(plain.equivalent(same)).toBe(true);
        expect(plain.equals(same)).toBe(true);
    });

    test("formats script and alias raw output branches", () => {
        const script = new Tag({ name: "script", body: "console.log(1)", meta: { type: "ivm" } });
        script.setMeta({ type: "ivm", version: "new" });
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
            meta: { type: "text" }
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
