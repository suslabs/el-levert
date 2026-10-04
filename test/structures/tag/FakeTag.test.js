import { describe, expect, test } from "vitest";

import FakeTag from "../../../src/structures/tag/FakeTag.js";
import Tag from "../../../src/structures/tag/Tag.js";
import TagError from "../../../src/errors/TagError.js";

describe("FakeTag", () => {
    test("inherits from Tag and sets fake tag properties", () => {
        const handler = async () => "result",
            fakeTag = new FakeTag({
                name: "custom_fake",
                execute: handler
            });

        expect(fakeTag).toBeInstanceOf(FakeTag);
        expect(fakeTag).toBeInstanceOf(Tag);
        expect(fakeTag.name).toBe("custom_fake");
        expect(fakeTag.execute).toBe(handler);
        expect(fakeTag.isFake).toBe(true);
        expect(fakeTag.isAlias).toBe(false);
    });

    test("inherits Tag.from factory method", () => {
        const fakeTag = new FakeTag({ name: "stream" });

        expect(FakeTag.from(fakeTag)).toBe(fakeTag);
        expect(FakeTag.from(null, true)).toBe(null);

        const fromObj = FakeTag.from({ name: "stream" });
        expect(fromObj).toBeInstanceOf(FakeTag);
        expect(fromObj.name).toBe("stream");
    });

    test("run executes the handler function", async () => {
        let calledWith = null;

        const fakeTag = new FakeTag({
            name: "test_tag",
            execute: async (tag, args, values, options) => {
                calledWith = { tag, args, values, options };
                return "execution_result";
            }
        });

        const out = await fakeTag.run("my_args", { val: 1 }, { opt: true });
        expect(out).toBe("execution_result");
        expect(calledWith.tag).toBe(fakeTag);
        expect(calledWith.args).toBe("my_args");
        expect(calledWith.values).toEqual({ val: 1 });
        expect(calledWith.options).toEqual({ opt: true });
    });

    test("run throws TagError if execute is missing or invalid", async () => {
        const fakeTag = new FakeTag({ name: "no_handler" });

        await expect(fakeTag.run()).rejects.toThrow("Cannot execute tag");
    });
});
