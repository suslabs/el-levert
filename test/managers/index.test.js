import { describe, expect, test } from "vitest";

import managers from "../../src/managers/index.js";

describe("managers index", () => {
    test("compiles the real manager exports by runtime names", () => {
        expect(Object.keys(managers).sort()).toEqual([
            "cliCommandManager",
            "commandManager",
            "inputManager",
            "permManager",
            "reminderManager",
            "tagManager"
        ]);
    });
});
