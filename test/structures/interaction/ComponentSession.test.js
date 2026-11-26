import { describe, expect, test } from "vitest";

import ComponentSession from "../../../src/structures/interaction/ComponentSession.js";

describe("ComponentSession", () => {
    test("creates and parses colon-delimited custom IDs", () => {
        expect(ComponentSession.createCustomId("page", "next", "sess1")).toBe("page:next:sess1");
        expect(ComponentSession.createCustomId("ai", "followup", "sess2", 2)).toBe("ai:followup:2:sess2");

        expect(ComponentSession.parseCustomId("")).toBeNull();
        expect(ComponentSession.parseCustomId("page:next")).toBeNull();
        expect(ComponentSession.parseCustomId("page::sess1")).toBeNull();
        expect(() => ComponentSession.createCustomId("page", "b:ad", "sess1")).toThrow("cannot contain colons");

        expect(ComponentSession.parseCustomId("page:next:sess1")).toEqual({
            prefix: "page",
            action: "next",
            args: [],
            sessionId: "sess1"
        });

        expect(ComponentSession.parseCustomId("ai:followup:2:sess2")).toEqual({
            prefix: "ai",
            action: "followup",
            args: ["2"],
            sessionId: "sess2"
        });
    });
});
