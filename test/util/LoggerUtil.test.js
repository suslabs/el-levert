import { describe, expect, test } from "vitest";

import LoggerUtil from "../../src/util/LoggerUtil.js";

describe("LoggerUtil", () => {
    test("formats log values and handles circular JSON errors", () => {
        expect(LoggerUtil.formatLog(null)).toBe(" none");
        expect(LoggerUtil.formatLog(true)).toBe(' "true"');
        expect(LoggerUtil.formatLog("quoted")).toBe(' "quoted"');
        expect(LoggerUtil.formatLog('"wrapped"')).toBe(' "wrapped"');
        expect(LoggerUtil.formatLog("x".repeat(90), 10)).toContain("---");

        const circular = {};
        circular.self = circular;
        expect(LoggerUtil.formatLog(circular)).toContain("error:");
    });

    test("formats binary and typed arrays with zero copies and byte limits", () => {
        expect(LoggerUtil.formatBinary(null)).toBeNull();
        expect(LoggerUtil.formatBinary("string")).toBeNull();
        expect(LoggerUtil.formatBinary([1, 2])).toBeNull();

        const buf = Buffer.from([0x01, 0x02, 0x03]);
        expect(LoggerUtil.formatBinary(buf)).toEqual({
            type: "Buffer",
            size: 3,
            data: "010203"
        });

        const u8 = new Uint8Array([0xaa, 0xbb]);
        expect(LoggerUtil.formatBinary(u8)).toEqual({
            type: "Uint8Array",
            size: 2,
            data: "aabb"
        });

        const ab = new ArrayBuffer(2);
        expect(LoggerUtil.formatBinary(ab)).toEqual({
            type: "ArrayBuffer",
            size: 2,
            data: "0000"
        });

        const serialized = {
            type: "Buffer",
            data: [0xde, 0xad, 0xbe, 0xef]
        };
        expect(LoggerUtil.formatBinary(serialized)).toEqual({
            type: "Buffer",
            size: 4,
            data: "deadbeef"
        });

        const array = [0x01, 0x02];
        expect(LoggerUtil.formatBinary(array, { allowArray: true })).toEqual({
            type: "Array",
            size: 2,
            data: "0102"
        });

        const longBuf = Buffer.alloc(300, 0x01);
        const longFormatted = LoggerUtil.formatBinary(longBuf, { byteLimit: 10 });
        expect(longFormatted.size).toBe(300);
        expect(longFormatted.data).toHaveLength(23);
        expect(longFormatted.data.endsWith("...")).toBe(true);
    });

    test("formats objects with nested buffers and typed arrays without expanding to raw arrays", () => {
        const payload = {
            name: "tag",
            buffer: Buffer.from([0x01, 0x02, 0x03]),
            view: new Uint8Array([0x04, 0x05]),
            nested: {
                raw: { type: "Buffer", data: [0x06, 0x07] }
            }
        };

        const logged = LoggerUtil.formatLog(payload);
        expect(logged).toContain('"buffer":{"type":"Buffer","size":3,"data":"010203"}');
        expect(logged).toContain('"view":{"type":"Uint8Array","size":2,"data":"0405"}');
        expect(logged).toContain('"raw":{"type":"Buffer","size":2,"data":"0607"}');
        expect(logged).not.toContain('"data":[1,2,3]');
        expect(logged).not.toContain('"data":[6,7]');
    });
});
