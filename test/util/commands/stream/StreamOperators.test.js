import { describe, expect, test } from "vitest";

import StreamOperators from "../../../../src/util/commands/stream/StreamOperators.js";
import StreamOperatorRegistry from "../../../../src/util/commands/stream/StreamOperatorRegistry.js";
import StreamStep from "../../../../src/structures/stream/StreamStep.js";
import StreamPipeline from "../../../../src/util/commands/stream/StreamPipeline.js";

import UtilError from "../../../../src/errors/UtilError.js";

describe("StreamOperators", () => {
    test("exports frozen operator definitions", () => {
        expect(Array.isArray(StreamOperators)).toBe(true);
        expect(Object.isFrozen(StreamOperators)).toBe(true);

        expect(StreamOperators[0].name).toBe("echo");

        const names = StreamOperators.map(op => op.name);
        expect(names).toContain("echo");
        expect(names).toContain("unembed");
        expect(names).toContain("unescape");
        expect(names).toContain("trim");
        expect(names).toContain("lower");
        expect(names).toContain("upper");
        expect(names).toContain("head");
        expect(names).toContain("tail");
    });
});

describe("StreamOperatorRegistry", () => {
    test("has all built-in operators", () => {
        const names = StreamOperatorRegistry.getNames();

        expect(names).toContain("echo");
        expect(names).toContain("unembed");
        expect(names).toContain("unescape");
        expect(names).toContain("trim");
        expect(names).toContain("lower");
        expect(names).toContain("upper");
        expect(names).toContain("head");
        expect(names).toContain("tail");
    });

    test("register and unregister custom operators", async () => {
        expect(() => StreamOperatorRegistry.register("", () => {})).toThrow(UtilError);
        expect(() => StreamOperatorRegistry.register("foo", null)).toThrow(UtilError);

        StreamOperatorRegistry.register("customReverse", input => String(input).split("").reverse().join(""));
        expect(StreamOperatorRegistry.has("customReverse")).toBe(true);

        const out = await StreamOperatorRegistry.execute("customReverse", "abc");
        expect(out).toBe("cba");

        expect(StreamOperatorRegistry.unregister("customReverse")).toBe(true);
        expect(StreamOperatorRegistry.has("customReverse")).toBe(false);
    });

    test("register supports operator objects with name and execute", async () => {
        StreamOperatorRegistry.register({
            name: "customDouble",
            execute: input => `${input}${input}`
        });
        expect(StreamOperatorRegistry.has("customDouble")).toBe(true);

        const out = await StreamOperatorRegistry.execute("customDouble", "hi");
        expect(out).toBe("hihi");

        expect(StreamOperatorRegistry.unregister("customDouble")).toBe(true);
    });

    test("executing unknown operator throws UtilError", async () => {
        await expect(StreamOperatorRegistry.execute("nonexistent", "input")).rejects.toThrow(UtilError);
    });

    test("echo operator prints text args or piped input", async () => {
        expect(await StreamOperatorRegistry.execute("echo", "", "hello world")).toBe("hello world");
        expect(await StreamOperatorRegistry.execute("echo", "hello world")).toBe("hello world");
        expect(await StreamOperatorRegistry.execute("echo", "piped text", "")).toBe("piped text");
        expect(await StreamOperatorRegistry.execute("echo", "world", "hello $!")).toBe("hello world!");

        const pipeline = StreamPipeline.parse("echo hello world > upper");
        expect(await pipeline.execute()).toBe("HELLO WORLD");
    });

    test("lower and upper operators", async () => {
        expect(await StreamOperatorRegistry.execute("lower", "HELLO WORLD")).toBe("hello world");
        expect(await StreamOperatorRegistry.execute("upper", "hello world")).toBe("HELLO WORLD");
    });

    test("trim operator", async () => {
        expect(await StreamOperatorRegistry.execute("trim", "   hello world   \n")).toBe("hello world");
    });

    test("unescape operator removes markdown escapes", async () => {
        expect(await StreamOperatorRegistry.execute("unescape", "\\*bold\\* and \\_italic\\_")).toBe(
            "*bold* and _italic_"
        );
        expect(await StreamOperatorRegistry.execute("unescape", "no escapes")).toBe("no escapes");
    });

    test("head operator extracts leading lines", async () => {
        const text = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12";

        const def = await StreamOperatorRegistry.execute("head", text);
        expect(def.split("\n")).toHaveLength(10);
        expect(def).toBe("1\n2\n3\n4\n5\n6\n7\n8\n9\n10");

        const custom = await StreamOperatorRegistry.execute("head", text, "3");
        expect(custom).toBe("1\n2\n3");

        const flag = await StreamOperatorRegistry.execute("head", text, "-n 2");
        expect(flag).toBe("1\n2");
    });

    test("tail operator extracts trailing lines", async () => {
        const text = "1\n2\n3\n4\n5";

        const custom = await StreamOperatorRegistry.execute("tail", text, "2");
        expect(custom).toBe("4\n5");

        const flag = await StreamOperatorRegistry.execute("tail", text, "-n 3");
        expect(flag).toBe("3\n4\n5");
    });

    test("unembed operator extracts embed text from input", async () => {
        const embedObj = {
            embeds: [
                {
                    title: "Test Title",
                    description: "Test Description"
                }
            ]
        };

        const out = await StreamOperatorRegistry.execute("unembed", embedObj);
        expect(out).toContain("Test Title");
        expect(out).toContain("Test Description");

        const jsonOut = await StreamOperatorRegistry.execute("unembed", JSON.stringify(embedObj));
        expect(jsonOut).toContain("Test Title");
        expect(jsonOut).toContain("Test Description");

        const plainOut = await StreamOperatorRegistry.execute("unembed", "plain string");
        expect(plainOut).toBe("plain string");
    });

    test("unembed operator extracts embeds from input msg.embeds", async () => {
        const mockMsg = {
            embeds: [
                {
                    title: "Msg Title",
                    description: "Msg Description"
                }
            ]
        };

        const out = await StreamOperatorRegistry.execute("unembed", "", "", mockMsg);
        expect(out).toContain("Msg Title");
        expect(out).toContain("Msg Description");
    });

    test("unembed operator extracts embeds from referenced message in msg.reference", async () => {
        const mockMsg = {
            embeds: [],
            reference: {
                messageId: "replyMsg123"
            },
            channel: {
                messages: {
                    cache: new Map([
                        [
                            "replyMsg123",
                            {
                                embeds: [
                                    {
                                        title: "Replied Embed Title",
                                        description: "Replied Embed Description"
                                    }
                                ]
                            }
                        ]
                    ])
                }
            }
        };

        const out = await StreamOperatorRegistry.execute("unembed", "", "", mockMsg);
        expect(out).toContain("Replied Embed Title");
        expect(out).toContain("Replied Embed Description");
    });

    test("unembed operator works end-to-end via StreamStep with msg in options", async () => {
        const step = StreamStep.parse("unembed"),
            mockMsg = {
                embeds: [
                    {
                        title: "Pipeline Embed",
                        description: "From values.msg"
                    }
                ]
            };

        const out = await step.execute("", { values: { msg: mockMsg } });
        expect(out).toContain("Pipeline Embed");
        expect(out).toContain("From values.msg");
    });
});
