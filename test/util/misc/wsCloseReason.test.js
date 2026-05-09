import { describe, expect, test } from "vitest";

import getCloseReason from "../../../src/util/misc/wsCloseReason.js";

describe("wsCloseReason", () => {
    test("maps websocket close codes to readable reasons", () => {
        expect(getCloseReason(1000)).toBe("Normal Closure");
        expect(getCloseReason(4321)).toBe("Unknown");
    });
});
