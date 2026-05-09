import { describe, expect, test } from "vitest";

import config from "../vitest.config.js";

describe("vitest config", () => {
    test("configures node tests and coverage exclusions", () => {
        expect(config.test.environment).toBe("node");
        expect(config.test.include).toContain("test/**/*.test.js");
        expect(config.test.exclude).toContain("**/node_modules/**");
        expect(config.test.coverage.exclude).toEqual(
            expect.arrayContaining(["stoat-compat/**", "src/vm/vm2/**", "src/vm/judge0/**"])
        );
    });
});
