import { describe, expect, test } from "vitest";
import "../../../../setupGlobals.js";
import ProxiedResult from "../../../../src/database/drivers/common/ProxiedResult.js";

describe("ProxiedResult", () => {
    test("sets data and info defaults and serializes the active payload", () => {
        const result = new ProxiedResult();

        expect(result.info).toEqual({
            lastID: 0,
            changes: 0
        });

        result.setInfo({
            changes: 3
        });
        result.setData({
            alpha: 1
        });

        expect(result.info).toEqual({
            lastID: 0,
            changes: 3
        });
        expect(result.toJSON()).toBe('{"alpha":1}');

        result._data = {
            beta: 2
        };
        result._info = {
            changes: 9
        };
        result._obj = {
            constructor: {
                name: "FakeResult"
            }
        };

        expect(result.toJSON()).toBe('{"beta":2}');
        expect(result[Symbol.for("nodejs.util.inspect.custom")]()).toContain("FakeResult");
    });
});

describe("Merged Branch Coverage", () => {
    describe("ProxiedResult branch coverage", () => {
        test("falls back to instance data and info when proxy fields are unset", () => {
            const result = new ProxiedResult();

            result.setData([
                {
                    alpha: 1
                }
            ]);

            expect(result.toJSON(2)).toBe('[{"alpha":1}]');

            const inspected = result[Symbol.for("nodejs.util.inspect.custom")]();

            expect(inspected).toContain("ProxiedResult");
            expect(inspected).toContain("lastID");
            expect(inspected).toContain("changes");
        });
    });
});
