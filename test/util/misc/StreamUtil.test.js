import { Readable } from "node:stream";

import { describe, expect, test } from "vitest";

import StreamUtil from "../../../src/util/misc/StreamUtil.js";

describe("StreamUtil", () => {
    test("reads bytes from buffer and string chunks", async () => {
        const stream = Readable.from([Buffer.from("a"), "é"]);

        expect((await StreamUtil.read(stream, 3)).toString()).toBe("aé");
        expect(stream.destroyed).toBe(true);
    });

    test("rejects oversized streams and destroys them", async () => {
        const stream = Readable.from([Buffer.from("ab"), Buffer.from("cd")]);

        await expect(StreamUtil.read(stream, 3)).rejects.toThrow("Stream exceeds maximum size");
        expect(stream.destroyed).toBe(true);
    });
});
