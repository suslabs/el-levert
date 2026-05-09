import { describe, expect, test } from "vitest";

import handlers from "../../src/handlers/index.js";

describe("handlers index", () => {
    test("compiles the real handler exports by runtime names", () => {
        expect(Object.keys(handlers).sort()).toEqual([
            "cliCommandHandler",
            "commandHandler",
            "previewHandler",
            "reactionHandler",
            "sedHandler"
        ]);
    });
});
