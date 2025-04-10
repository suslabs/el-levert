import Stoik from "../../src/parsers/stoik/Stoik.js";
import Molecule from "../../src/parsers/stoik/Molecule.js";

describe("Molecule", () => {
    it("should properly initialize using all constructors", () => {
        expect(new Molecule("H", 2)).toEqual(new Molecule([["H", 2]]));
        expect(new Molecule("H")).toEqual(new Molecule([["H", 1]]));
        expect(new Molecule("H", 1)).toEqual(new Molecule([["H"]]));
        expect(new Molecule(new Molecule("H", 2))).toEqual(new Molecule("H", 2));

        expect(() => new Molecule("asdasdas")).toThrow();
    });

    it("should trim excess zeroes when adding and subtracting", () => {
        const lhs = new Molecule("H").addMut("O"),
            rhs = new Molecule("H").addMut("O");

        lhs.subtractMut(rhs);

        expect(lhs.has("H")).toBe(false);
        expect(lhs.has("O")).toBe(false);
    });

    it("should produce equal results using mutable and immutable methods", () => {
        const molecule = new Molecule("H").addMut("O");

        expect(molecule.add("H")).toEqual(molecule.addMut("H"));
        expect(molecule.subtract("H")).toEqual(molecule.subtractMut("H"));
        expect(molecule.negate()).toEqual(molecule.negateMut());
        expect(molecule.multiply(5)).toEqual(molecule.multiplyMut(5));

        expect(molecule).toEqual(
            new Molecule([
                ["H", -5],
                ["O", -5]
            ])
        );
    });

    it("should work with any combinations of operands", () => {
        const a = Stoik.evaluate("A - 2A"),
            b = Stoik.evaluate("2A - A");

        expect(a).not.toEqual(b);

        const c = Stoik.evaluate("A - A");

        expect(c).toBeInstanceOf(Molecule);
        expect(c.get("A")).toBeUndefined();
    });

    it("should subtract respecting associativity", () => {
        const a = Stoik.evaluate("A - 2A"),
            b = Stoik.evaluate("2A - A"),
            c = Stoik.evaluate("A - C"),
            d = Stoik.evaluate("C - A");

        expect(a).toBeInstanceOf(Molecule);
        expect(b).toBeInstanceOf(Molecule);
        expect(c).toBeInstanceOf(Molecule);
        expect(d).toBeInstanceOf(Molecule);

        expect(a).not.toEqual(b);
        expect(a).toEqual(new Molecule([["A", -1]]));
        expect(b).toEqual(new Molecule([["A", 1]]));

        expect(c).toEqual(
            new Molecule([
                ["A", 1],
                ["C", -1]
            ])
        );

        expect(d).toEqual(
            new Molecule([
                ["A", -1],
                ["C", 1]
            ])
        );
    });
});
