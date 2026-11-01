import { describe, expect, test } from "vitest";

import WebsocketCommandParser from "../../../../src/parsers/websocket/WebsocketCommandParser.js";

describe("WebsocketCommandParser", () => {
    test("supports top-level validation shorthand through shared argument compilation", () => {
        const parser = new WebsocketCommandParser({
            count: {
                type: "integer",
                required: true,
                valid: {
                    min: 2
                }
            }
        });

        let session = parser.parse({}, {});

        expect(session.valid).toBe(false);
        expect(session.issues[0].code).toBe("required");

        session = parser.parse(
            {
                count: 3
            },
            {}
        );

        expect(session.valid).toBe(true);
        expect(session.results.get("count").value).toBe(3);
    });
});
