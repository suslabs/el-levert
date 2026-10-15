import util from "node:util";

import { describe, expect, test } from "vitest";

import ProxiedResult from "../../../../src/database/drivers/common/ProxiedResult.js";
import SqliteResult from "../../../../src/database/drivers/sqlite/SqliteResult.js";

describe("ResultProxyHandler", () => {
    test("proxies sqlite results through data, info, and target accessors", () => {
        const symbol = Symbol("meta");
        const result = new SqliteResult({ value: "alpha" }, { lastID: 7, changes: 2 });

        expect(result.value).toBe("alpha");
        expect(result.lastID).toBe(7);
        expect(result.changes).toBe(2);
        expect(result._data).toEqual({ value: "alpha" });
        expect(result._info).toEqual({ lastID: 7, changes: 2 });
        expect(result._obj).toBeInstanceOf(ProxiedResult);
        expect("value" in result).toBe(true);
        expect("changes" in result).toBe(true);

        result.extra = "beta";
        expect(result.extra).toBe("beta");
        expect(Reflect.set(result, "_data", "blocked")).toBe(false);
        expect(Reflect.set(result, "changes", 3)).toBe(false);

        result[symbol] = "symbolic";
        expect(result[symbol]).toBe("symbolic");
        expect(delete result.extra).toBe(true);
        expect(Reflect.deleteProperty(result, "_data")).toBe(false);
        expect(Reflect.deleteProperty(result, "changes")).toBe(false);
        expect(delete result[symbol]).toBe(true);

        expect(Reflect.ownKeys(result)).toEqual(["value"]);
        expect(Object.getOwnPropertyDescriptor(result, "value").configurable).toBe(true);
        expect(result.toJSON()).toBe(JSON.stringify({ value: "alpha" }));
        expect(util.inspect(result)).toContain("SqliteResult");
    });

    test("proxies sqlite array results as genuine arrays with metadata accessors", () => {
        const rows = [{ value: "alpha" }, { value: "beta" }];
        const result = new SqliteResult(rows, { lastID: 0, changes: 0 });

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ value: "alpha" });
        expect(result.map(r => r.value)).toEqual(["alpha", "beta"]);
        expect(result.lastID).toBe(0);
        expect(result.changes).toBe(0);
        expect(result._data).toBe(rows);
        expect(result._obj).toBeInstanceOf(ProxiedResult);
        expect(result.toJSON()).toBe(JSON.stringify(rows));
    });
});
