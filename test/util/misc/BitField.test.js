import { describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import BitField from "../../../src/util/misc/BitField.js";
import BitFieldError from "../../../src/errors/BitFieldError.js";

class ValidatedBitField extends BitField {
    validate() {
        if (this.get(2)) {
            throw new Error("too big");
        }
    }
}

describe("BitField", () => {
    test("sets, clones, compares, serializes, and coerces", () => {
        const bitfield = new BitField(new Uint8Array(1), {
            grow: 16
        });

        expect(bitfield.length).toBe(8);
        expect(bitfield.isEmpty()).toBe(true);

        bitfield.set(0, true);
        bitfield.set(3, true);
        bitfield.set(3, false);
        bitfield.setAll([false, true, true], 4);

        expect(bitfield.get(0)).toBe(true);
        expect(bitfield.get(1)).toBe(false);
        expect(bitfield.get(5)).toBe(true);
        expect(bitfield.get(6)).toBe(true);
        expect(bitfield.get(9)).toBe(false);
        expect(bitfield.isEmpty()).toBe(false);

        const iterated = [];
        bitfield.forEach((value, index) => iterated.push([index, value]), 0, 8);
        expect(iterated).toEqual([
            [0, true],
            [1, false],
            [2, false],
            [3, false],
            [4, false],
            [5, true],
            [6, true],
            [7, false]
        ]);

        const clone = bitfield.clone();
        expect(clone).not.toBe(bitfield);
        expect(clone.equals(bitfield)).toBe(true);
        expect(bitfield.toHex()).toBe("61");
        expect(bitfield.toNumber()).toBe(97);
        expect(bitfield.toBuffer()).toEqual(Buffer.from([97]));

        clone.set(7, true);
        expect(clone.equals(bitfield)).toBe(false);
        expect(clone.toBuffer()).toEqual(Buffer.from([225]));
    });

    test("validates a candidate before committing mutations", () => {
        const bitfield = new ValidatedBitField(new Uint8Array(1), {
            grow: 8
        });

        bitfield.set(0, true);
        bitfield.set(1, true);

        expect(() => bitfield.set(2, true)).toThrow("too big");
        expect(bitfield.toNumber()).toBe(3);
        expect(bitfield.toBuffer()).toEqual(Buffer.from([3]));
    });

    test("throws BitFieldError for generic invalid input", () => {
        const bitfield = new BitField(new Uint8Array(1));
        const bytes = new Uint8Array([1]),
            shared = new BitField(bytes);

        bytes[0] = 2;
        expect(new BitField(97).toBuffer()).toEqual(Buffer.from([97]));
        expect(new BitField(0x1234).toBuffer()).toEqual(Buffer.from([0x34, 0x12]));
        expect(new BitField([1, 2]).toBuffer()).toEqual(Buffer.from([1, 2]));
        expect(shared.toBuffer()).toEqual(Buffer.from([2]));
        expect(() => new BitField(-1)).toThrow(BitFieldError);
        expect(() => bitfield.set(-1)).toThrow(BitFieldError);
        expect(() => bitfield.setAll(null)).toThrow(BitFieldError);
        expect(() => bitfield.setFlag("missing")).toThrow(BitFieldError);
    });
});
