import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addTag,
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;
let msg;
let FakeTag;
let Tag;
let FakeTags;
let TagError;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadHandlers: true,
        loadVMs: true
    });

    ({ default: FakeTag } = await import("../../../src/structures/tag/FakeTag.js"));
    ({ default: Tag } = await import("../../../src/structures/tag/Tag.js"));
    ({ default: FakeTags } = await import("../../../src/managers/database/FakeTags.js"));
    ({ default: TagError } = await import("../../../src/errors/TagError.js"));

    msg = createCommandMessage("%tag stream");
    await addTag(runtime, "source_tag", "hello world", msg.author.id);
    await addTag(runtime, "echo_tag", "tag.args", msg.author.id, {
        type: "ivm"
    });
}, 30000);

afterEach(async () => {
    await cleanupRuntime(runtime);
}, 30000);

describe("tag stream command and fake tag system", () => {
    test("FakeTags contains registered FakeTag entries", () => {
        expect(Array.isArray(FakeTags)).toBe(true);
        expect(FakeTags.length).toBeGreaterThanOrEqual(2);

        for (const entry of FakeTags) {
            expect(entry.name).toBeTruthy();
            expect(typeof entry.execute).toBe("function");
        }
    });

    test("FakeTagRegistry integrates with TagManager exists and fetch", async () => {
        const { tagManager } = runtime.client;

        expect(await tagManager.exists("stream")).toBe(true);
        expect(await tagManager.exists("pipe")).toBe(true);
        expect(await tagManager.exists(["stream", "pipe", "nonexistent"])).toEqual([true, true, false]);

        const streamTag = await tagManager.fetch("stream");
        expect(streamTag).not.toBeNull();
        expect(streamTag instanceof FakeTag).toBe(true);
        expect(streamTag instanceof Tag).toBe(true);
        expect(streamTag.name).toBe("stream");
        expect(streamTag.isFake).toBe(true);

        const streamTag2 = await tagManager.fetch("stream");
        expect(streamTag2).not.toBe(streamTag);
        expect(streamTag2 instanceof FakeTag).toBe(true);
        expect(streamTag2.name).toBe("stream");
        expect(streamTag2.isFake).toBe(true);

        const pipeTag = await tagManager.fetch("pipe");
        expect(pipeTag).not.toBeNull();
        expect(pipeTag instanceof FakeTag).toBe(true);
        expect(pipeTag.name).toBe("pipe");
        expect(pipeTag.isFake).toBe(true);

        await expect(tagManager.delete(streamTag)).rejects.toThrow("Cannot delete tag");
        await expect(tagManager.edit(streamTag, "new body")).rejects.toThrow("Cannot edit tag");
        await expect(tagManager.chown(streamTag, "12345")).rejects.toThrow("Cannot transfer ownership of tag");
        await expect(tagManager.rename(streamTag, "new_name")).rejects.toThrow("Cannot rename tag");
    });

    test("returns help message when called with empty arguments", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "stream", { msg });

        expect(out).toContain("tag1 > tag2 > ... > tagN");
    });

    test("executes pipeline with operators using > and | delimiters", async () => {
        const command = getCommand(runtime, "tag");

        const out1 = await executeCommand(command, "stream source_tag > upper", { msg });
        expect(out1[0]).toBe("HELLO WORLD");

        const out2 = await executeCommand(command, "stream source_tag | upper", { msg });
        expect(out2[0]).toBe("HELLO WORLD");

        const out3 = await executeCommand(command, "pipe source_tag | upper | lower", { msg });
        expect(out3[0]).toBe("hello world");
    });

    test("forwards input between tags in pipeline", async () => {
        const command = getCommand(runtime, "tag");

        const out = await executeCommand(command, "stream source_tag | echo_tag | upper", { msg });
        expect(out[0]).toBe("HELLO WORLD");
    });

    test("substitutes $ placeholder in step arguments", async () => {
        const command = getCommand(runtime, "tag");

        const out = await executeCommand(command, "stream source_tag | echo_tag prefix $ suffix", { msg });
        expect(out[0]).toBe("prefix hello world suffix");
    });

    test("allows user tags to alias to stream", async () => {
        const command = getCommand(runtime, "tag");

        const aliasRes = await executeCommand(command, "alias mychain stream source_tag | upper", { msg });
        expect(aliasRes).toContain("aliased");

        const out = await executeCommand(command, "mychain", { msg });
        expect(out[0]).toBe("HELLO WORLD");
    });

    test("allows user tags to alias to stream with runtime argument substitution", async () => {
        const command = getCommand(runtime, "tag");

        await executeCommand(command, "alias shout stream echo_tag $ | upper", { msg });

        const out = await executeCommand(command, "shout custom_input", { msg });
        expect(out[0]).toBe("CUSTOM_INPUT");
    });

    test("returns warning when tag in pipeline does not exist", async () => {
        const command = getCommand(runtime, "tag");

        const out = await executeCommand(command, "stream nonexistent_tag | upper", { msg });
        expect(out).toContain("doesn't exist");
    });

    test("description documents all registered stream operators", async () => {
        const { default: TagStreamCommand } = await import("../../../src/commands/tag/stream.js"),
            { default: StreamOperatorRegistry } =
                await import("../../../src/util/commands/stream/StreamOperatorRegistry.js");

        const opNames = StreamOperatorRegistry.getNames();
        expect(TagStreamCommand.info.description).toBeTruthy();

        for (const opName of opNames) {
            expect(TagStreamCommand.info.description).toContain(opName);
        }
    });

    test("returns help text including operators when called with -help", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "stream -help", { msg });

        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.fields[0].name).toBe("Description");
        expect(out.embeds[0].data.fields[1].name).toBe("Usage");

        const desc = out.embeds[0].data.fields[0].value;
        expect(desc).toContain("echo");
        expect(desc).toContain("unembed");
        expect(desc).toContain("unescape");
        expect(desc).toContain("trim");
        expect(desc).toContain("lower");
        expect(desc).toContain("upper");
        expect(desc).toContain("head");
        expect(desc).toContain("tail");
    });

    test("blocks creating, editing, renaming, or aliasing on top of fake tags", async () => {
        const command = getCommand(runtime, "tag");

        expect(await executeCommand(command, "add stream test", { msg })).toContain("is a __command__, not a __tag__");
        expect(await executeCommand(command, "add pipe test", { msg })).toContain("is a __command__, not a __tag__");
        expect(await executeCommand(command, "edit stream test", { msg })).toContain("is a __command__, not a __tag__");
        expect(await executeCommand(command, "rename stream test", { msg })).toContain(
            "is a __command__, not a __tag__"
        );
        expect(await executeCommand(command, "alias stream test", { msg })).toContain(
            "is a __command__, not a __tag__"
        );
    });

    test("resolves multi-hop aliases pointing to stream", async () => {
        const command = getCommand(runtime, "tag");

        await executeCommand(command, "alias hop1 stream echo hello", { msg });
        await executeCommand(command, "alias hop2 hop1", { msg });

        const out = await executeCommand(command, "hop2", { msg });
        expect(out[0]).toBe("hello");
    });
});
