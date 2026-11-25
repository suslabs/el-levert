import { describe, expect, test } from "vitest";

import ComponentSession from "../../../src/structures/interaction/ComponentSession.js";

describe("ComponentSession", () => {
    test("creates and parses colon-delimited custom IDs", () => {
        expect(ComponentSession.createCustomId("page", "next", "sess1")).toBe("page:next:sess1");
        expect(ComponentSession.createCustomId("ai", "followup", 2, "sess2")).toBe("ai:followup:2:sess2");

        expect(ComponentSession.parseCustomId("")).toBeNull();
        expect(ComponentSession.parseCustomId(null)).toBeNull();

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
