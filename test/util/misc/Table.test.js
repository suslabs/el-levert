import { describe, expect, test } from "vitest";

import { Table, drawTable } from "../../../src/util/misc/Table.js";

describe("Table", () => {
    test("draws tables with preset and custom styles", () => {
        const table = new Table({ a: "A", b: "B" }, { a: ["1", "22"], b: ["333", "4"] }, "light", { extraSpaces: 1 });

        expect(table.columnWidths()).toEqual([4, 5]);
        expect(table.maxRowHeight()).toBe(2);
        expect(table.draw()).toContain("┌");

        expect(
            drawTable({ a: "A" }, { a: "x" }, "double", {
                sideLines: false,
                center: true
            })
        ).toContain("A");

        expect(() => new Table({}, {}, "missing").charset).toThrow("Invalid style");
        expect(() => new Table({}, {}, "custom").charset).toThrow("No custom charset object provided");
    });
});
