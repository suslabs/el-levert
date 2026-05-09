import { describe, expect, test } from "vitest";
import "../../../../setupGlobals.js";
import SqliteResult from "../../../../src/database/drivers/sqlite/SqliteResult.js";

describe("SqliteResult", () => {
    test("proxies sqlite statement metadata and row access", () => {
        const result = new SqliteResult(
            {
                alpha: 1
            },
            {
                lastID: 12,
                changes: 4
            }
        );

        expect(result.alpha).toBe(1);
        expect(result.lastID).toBe(12);
        expect(result.changes).toBe(4);

        result.beta = 2;
        expect(result.beta).toBe(2);

        expect(Reflect.deleteProperty(result, "lastID")).toBe(false);
        expect(Reflect.deleteProperty(result, "_data")).toBe(false);

        const symbol = Symbol("extra");
        result[symbol] = 5;
        expect(result[symbol]).toBe(5);
        expect("_obj" in result).toBe(false);
        expect("alpha" in result).toBe(true);
    });
});

describe("Merged Branch Coverage", () => {
    describe("SqliteResult branch coverage", () => {
        test("preserves default info values when sqlite metadata is missing", () => {
            const result = new SqliteResult(
                {
                    alpha: 1
                },
                {}
            );

            expect(result.lastID).toBe(0);
            expect(result.changes).toBe(0);
        });
    });
});
