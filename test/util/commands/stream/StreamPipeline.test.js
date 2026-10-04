import { describe, expect, test } from "vitest";

import StreamPipeline from "../../../../src/util/commands/stream/StreamPipeline.js";

import TagError from "../../../../src/errors/TagError.js";

describe("StreamPipeline", () => {
    test("parses pipeline text with > and | delimiters", () => {
        const pipeline = StreamPipeline.parse("step1 > step2 | step3");

        expect(pipeline).toBeInstanceOf(StreamPipeline);
        expect(pipeline.steps).toHaveLength(3);
        expect(pipeline.steps[0].name).toBe("step1");
        expect(pipeline.steps[1].name).toBe("step2");
        expect(pipeline.steps[2].name).toBe("step3");
    });

    test("respects quotes when splitting pipeline", () => {
        const pipeline = StreamPipeline.parse('echo "hello > world" | upper');

        expect(pipeline.steps).toHaveLength(2);
        expect(pipeline.steps[0].name).toBe("echo");
        expect(pipeline.steps[0].args).toBe('"hello > world"');
        expect(pipeline.steps[1].name).toBe("upper");
    });

    test("throws TagError on empty pipeline or empty step", () => {
        expect(() => StreamPipeline.parse("")).toThrow(TagError);
        expect(() => StreamPipeline.parse("   ")).toThrow(TagError);
        expect(() => StreamPipeline.parse("step1 > > step2")).toThrow(TagError);
    });

    test("throws TagError when pipeline exceeds maxSteps", () => {
        const steps = Array(31).fill("upper").join(" > ");
        expect(() => StreamPipeline.parse(steps)).toThrow(TagError);
    });

    test("executes pipeline of operators sequentially", async () => {
        const pipeline = StreamPipeline.parse("upper | lower | trim");
        const out = await pipeline.execute("   HELLO WORLD   ");

        expect(out).toBe("hello world");
    });
});
