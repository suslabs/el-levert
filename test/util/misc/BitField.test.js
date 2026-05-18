import { describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import BitField from "../../../src/util/misc/BitField.js";
import UtilError from "../../../src/errors/UtilError.js";

class ValidatedBitField extends BitField {
    validate() {
        if (this.toNumber() > 3) {
            throw new Error("too big");
        }
    }
}

describe("BitField", () => {
    test("sets, clones, compares, serializes, and coerces", () => {
        const bitfield = new BitField(8, {
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
        expect(bitfield.toNumber()).toBe(97);
        expect(bitfield.toJSON()).toBe(97);
        expect(bitfield.toBuffer()).toEqual(Buffer.from([97]));

        clone.set(7, true);
        expect(clone.equals(bitfield)).toBe(false);
        expect(clone.toBuffer()).toEqual(Buffer.from([225]));
    });

    test("validates a candidate before committing mutations", () => {
        const bitfield = new ValidatedBitField(8, {
            grow: 8
        });

        bitfield.set(0, true);
        bitfield.set(1, true);

        expect(() => bitfield.set(2, true)).toThrow("too big");
        expect(bitfield.toNumber()).toBe(3);
        expect(bitfield.toBuffer()).toEqual(Buffer.from([3]));
    });

    test("throws UtilError for generic invalid input", () => {
        const bitfield = new BitField(8);

        expect(() => bitfield.set(-1)).toThrow(UtilError);
        expect(() => bitfield.setAll(null)).toThrow(UtilError);
        expect(() => bitfield.setFlag("missing")).toThrow(UtilError);
    });
});
