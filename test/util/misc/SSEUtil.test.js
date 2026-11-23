import { Readable } from "node:stream";

import { describe, expect, test } from "vitest";

import SSEUtil from "../../../src/util/misc/SSEUtil.js";

const streamOf = chunks => Readable.from(chunks.map(chunk => Buffer.from(chunk)));

async function collect(stream) {
    const events = [];

    for await (const event of SSEUtil.readEvents(stream)) {
        events.push(event);
    }

    return events;
}

describe("SSEUtil", () => {
    test("reads data events split across chunks and line endings", async () => {
        const events = await collect(
            streamOf(['data: {"a":', "1}\r\n\r\n: comment\n\ndata: x\ndata: y\n\n", "data: last"])
        );
        expect(events).toEqual(['{"a":1}', "x\ny", "last"]);
    });

    test("decodes multi-byte characters split between chunks", async () => {
        const bytes = Buffer.from("data: 1️⃣\n\n");
        expect(await collect(Readable.from([bytes.subarray(0, 8), bytes.subarray(8)]))).toEqual(["1️⃣"]);
    });
});
