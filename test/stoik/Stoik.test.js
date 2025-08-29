import Stoik from "../../src/parsers/stoik/Stoik.js";
import Molecule from "../../src/parsers/stoik/Molecule.js";

import { TokenType } from "../../src/parsers/stoik/Tokens.js";

import StoikError from "../../src/errors/StoikError.js";

describe("tokenize", () => {
    it("should throw on invalid characters", () => {
        expect(() => Stoik.tokenize("🐱‍👤")).toThrow();
    });

    it("should Stoik.tokenize chemical equations", () => {
        const tokens = Stoik.tokenize("H2O");

        expect(tokens).toEqual([
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "O"]
        ]);
    });

    it("should Stoik.tokenize numbers with multiple digits", () => {
        const tokens = Stoik.tokenize("H22O");

        expect(tokens).toEqual([
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 22],
            [TokenType.Add],
            [TokenType.Element, "O"]
        ]);
    });

    it("should Stoik.tokenize chemical equations with subscripts", () => {
        const tokens = Stoik.tokenize("H2O2");

        expect(tokens).toEqual([
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "O"],
            [TokenType.Subscript],
            [TokenType.Number, 2]
        ]);
    });

    it("should Stoik.tokenize chemical equations with subscripts and coefficients", () => {
        const tokens = Stoik.tokenize("2H2O2");

        expect(tokens).toEqual([
            [TokenType.Number, 2],
            [TokenType.Coefficient],
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "O"],
            [TokenType.Subscript],
            [TokenType.Number, 2]
        ]);
    });

    it("should Stoik.tokenize chemical equations with parentheses", () => {
        const tokens = Stoik.tokenize("(H2O)2");

        expect(tokens).toEqual([
            [TokenType.GroupLeft],
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "O"],
            [TokenType.GroupRight],
            [TokenType.Subscript],
            [TokenType.Number, 2]
        ]);
    });

    it("should Stoik.tokenize chemical equations with parentheses and coefficients", () => {
        const tokens = Stoik.tokenize("2(H2O)2");

        expect(tokens).toEqual([
            [TokenType.Number, 2],
            [TokenType.Coefficient],
            [TokenType.GroupLeft],
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "O"],
            [TokenType.GroupRight],
            [TokenType.Subscript],
            [TokenType.Number, 2]
        ]);
    });

    it("should Stoik.tokenize ambiguous chemical equations", () => {
        const tokens = Stoik.tokenize("5(H2O)3((FeW)5CrMo2V)6CoMnSi");

        expect(tokens).toEqual([
            [TokenType.Number, 5],
            [TokenType.Coefficient],
            [TokenType.GroupLeft],
            [TokenType.Element, "H"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "O"],
            [TokenType.GroupRight],
            [TokenType.Subscript],
            [TokenType.Number, 3],
            [TokenType.Add],
            [TokenType.GroupLeft],
            [TokenType.GroupLeft],
            [TokenType.Element, "Fe"],
            [TokenType.Add],
            [TokenType.Element, "W"],
            [TokenType.GroupRight],
            [TokenType.Subscript],
            [TokenType.Number, 5],
            [TokenType.Add],
            [TokenType.Element, "Cr"],
            [TokenType.Add],
            [TokenType.Element, "Mo"],
            [TokenType.Subscript],
            [TokenType.Number, 2],
            [TokenType.Add],
            [TokenType.Element, "V"],
            [TokenType.GroupRight],
            [TokenType.Subscript],
            [TokenType.Number, 6],
            [TokenType.Add],
            [TokenType.Element, "Co"],
            [TokenType.Add],
            [TokenType.Element, "Mn"],
            [TokenType.Add],
            [TokenType.Element, "Si"]
        ]);
    });

    it("should throw on unmatched parentheses", () => {
        expect(() => Stoik.tokenize("(H2O")).toThrow(StoikError);
        expect(() => Stoik.tokenize("H2O)")).toThrow(StoikError);
    });
});

describe("toRPN", () => {
    it("should accept both tokens and string representations alike", () => {
        expect(Stoik.toRPN("5(H2O)3((FeW)5CrMo2V)6CoMnSi")).toEqual(
            Stoik.toRPN(Stoik.tokenize("5(H2O)3((FeW)5CrMo2V)6CoMnSi"))
        );
    });

    it("should convert chemical equations to RPN", () => {
        const tokens = Stoik.toRPN(Stoik.tokenize("H2O"));

        expect(tokens).toEqual([
            [TokenType.Element, "H"],
            [TokenType.Number, 2],
            [TokenType.Subscript],
            [TokenType.Element, "O"],
            [TokenType.Add]
        ]);
    });

    it("should convert chemical equations with subscripts to RPN", () => {
        const tokens = Stoik.toRPN(Stoik.tokenize("H2O2"));

        expect(tokens).toEqual([
            [TokenType.Element, "H"],
            [TokenType.Number, 2],
            [TokenType.Subscript],
            [TokenType.Element, "O"],
            [TokenType.Number, 2],
            [TokenType.Subscript],
            [TokenType.Add]
        ]);
    });

    it("should convert chemical equations with subscripts and coefficients to RPN", () => {
        const tokens = Stoik.toRPN(Stoik.tokenize("2H2O2"));

        expect(tokens).toEqual([
            [TokenType.Number, 2],
            [TokenType.Element, "H"],
            [TokenType.Number, 2],
            [TokenType.Subscript],
            [TokenType.Element, "O"],
            [TokenType.Number, 2],
            [TokenType.Subscript],
            [TokenType.Add],
            [TokenType.Coefficient]
        ]);
    });
});

describe("evaluate", () => {
    it("should throw when receiving no value", () => {
        expect(() => Stoik.evaluate([])).toThrow();
        expect(() => Stoik.evaluate("")).toThrow();
    });

    it("should accept both RPN and string representations alike", () => {
        expect(Stoik.evaluate("5(H2O)3((FeW)5CrMo2V)6CoMnSi")).toEqual(
            Stoik.evaluate(Stoik.toRPN("5(H2O)3((FeW)5CrMo2V)6CoMnSi"))
        );
    });

    it("should Stoik.evaluate chemical equations", () => {
        const result = Stoik.evaluate("H2O");

        expect(result).toBeInstanceOf(Molecule);

        expect(result).toEqual(
            new Molecule([
                ["H", 2],
                ["O", 1]
            ])
        );
    });

    it("should Stoik.evaluate chemical equations with subscripts", () => {
        const result = Stoik.evaluate("H2O2");

        expect(result).toBeInstanceOf(Molecule);

        expect(result).toEqual(
            new Molecule([
                ["H", 2],
                ["O", 2]
            ])
        );
    });

    it("should Stoik.evaluate chemical equations with subscripts and coefficients", () => {
        const result = Stoik.evaluate("2H2O2");

        expect(result).toBeInstanceOf(Molecule);

        expect(result).toEqual(
            new Molecule([
                ["H", 4],
                ["O", 4]
            ])
        );
    });

    it("should Stoik.evaluate chemical equations with parentheses", () => {
        const result = Stoik.evaluate("(H2O)2");

        expect(result).toBeInstanceOf(Molecule);

        expect(result).toEqual(
            new Molecule([
                ["H", 4],
                ["O", 2]
            ])
        );
    });

    it("should Stoik.evaluate chemical equations with parentheses and coefficients", () => {
        const result = Stoik.evaluate("2(H2O)2");

        expect(result).toBeInstanceOf(Molecule);

        expect(result).toEqual(
            new Molecule([
                ["H", 8],
                ["O", 4]
            ])
        );
    });

    it("should Stoik.evaluate ambiguous chemical equations", () => {
        expect(Stoik.evaluate("H2 O")).toEqual(Stoik.evaluate("H 2O"));
        expect(Stoik.evaluate("2H 2O")).toEqual(Stoik.evaluate("H4O2"));
        expect(Stoik.evaluate("2H2 2O")).toEqual(Stoik.evaluate("H8O2"));
        expect(Stoik.evaluate("2H2 2O2")).toEqual(Stoik.evaluate("H8O4"));
        expect(Stoik.evaluate("2H2 2O2 2")).toEqual(Stoik.evaluate("H8O8"));
        expect(Stoik.evaluate("2H2 2O2 2 2H")).toEqual(Stoik.evaluate("H10O16"));

        expect(() => Stoik.evaluate("2 2H2 2O2 2")).toThrow();
    });

    it("should Stoik.evaluate complex chemical equations", () => {
        const result = Stoik.evaluate("5(H2O)3((FeW)5CrMo2V)6CoMnSi");

        expect(result).toBeInstanceOf(Molecule);

        expect(result).toEqual(
            new Molecule([
                ["H", 30],
                ["Co", 5],
                ["Cr", 30],
                ["Fe", 150],
                ["Mn", 5],
                ["Mo", 60],
                ["O", 15],
                ["Si", 5],
                ["V", 30],
                ["W", 150]
            ])
        );
    });

    it("should Stoik.evaluate any combinations of tokens", () => {
        const result = Stoik.evaluate("2(2C2(2(C)2)2(C)(C)(2C)((2(C2(2C)))2))(C2)2");

        expect(result).toBeInstanceOf(Molecule);
        expect(result).toEqual(new Molecule([["C", 128]]));
    });

    it("should treat explicit plus sign as different formulas", () => {
        expect(Stoik.evaluate("H2O + H2O")).toEqual(Stoik.evaluate("(H2O)(H2O)"));

        expect(Stoik.evaluate("5(H2O)3((FeW)5CrMo2V)6CoMnSi + 5(H2O)3((FeW)5CrMo2V)6CoMnSi")).toEqual(
            Stoik.evaluate("(5(H2O)3((FeW)5CrMo2V)6CoMnSi)(5(H2O)3((FeW)5CrMo2V)6CoMnSi)")
        );
    });

    describe("operators", () => {
        const exampleTokens = {
            [TokenType.GroupLeft]: [TokenType.GroupLeft],
            [TokenType.GroupRight]: [TokenType.GroupRight],
            [TokenType.Number]: [TokenType.Number, 2],
            [TokenType.Add]: [TokenType.Add],
            [TokenType.Subtract]: [TokenType.Subtract],
            [TokenType.Element]: [TokenType.Element, "H"],
            [TokenType.Coefficient]: [TokenType.Coefficient],
            [TokenType.Subscript]: [TokenType.Subscript],
            molecule: new Molecule(),
            [TokenType.Join]: [TokenType.Join]
        };

        const combine = input => {
            const output = [];

            for (let i = 0; i < input.length; i++) {
                for (let j = 0; j < input.length; j++) {
                    output.push([input[i], input[j]]);
                }
            }

            return output;
        };

        const tokenPermutations = combine(Object.values(exampleTokens));

        describe("add operand validity", () => {
            const validTokens = new Set([exampleTokens[TokenType.Element], exampleTokens.molecule]);

            tokenPermutations.forEach(([lhs, rhs]) => {
                const shouldPass = validTokens.has(lhs) && validTokens.has(rhs);
                it(`addition of ${lhs[0] || "molecule"} and ${rhs[0] || "molecule"} should ${
                    shouldPass ? "pass" : "fail"
                }`, () => {
                    const input = [lhs, rhs, exampleTokens[TokenType.Add]];

                    if (shouldPass) {
                        expect(() => Stoik.evaluate(input)).not.toThrow();
                    } else {
                        expect(() => Stoik.evaluate(input)).toThrow();
                    }
                });
            });
        });

        describe("subscript operand validity", () => {
            tokenPermutations.forEach(([lhs, rhs]) => {
                const lhsIsValid = lhs instanceof Molecule || (Array.isArray(lhs) && lhs[0] === TokenType.Element),
                    rhsIsValid = Array.isArray(rhs) && rhs[0] === TokenType.Number,
                    shouldPass = lhsIsValid && rhsIsValid;

                it(`subscription of ${lhs[0] || "molecule"} and ${rhs[0]} should ${
                    shouldPass ? "pass" : "fail"
                }`, () => {
                    const input = [lhs, rhs, exampleTokens[TokenType.Subscript]];

                    if (shouldPass) {
                        expect(() => Stoik.evaluate(input)).not.toThrow();
                    } else {
                        expect(() => Stoik.evaluate(input)).toThrow();
                    }
                });
            });
        });

        describe("coefficient operand validity", () => {
            tokenPermutations.forEach(([lhs, rhs]) => {
                const lhsIsValid = Array.isArray(lhs) && lhs[0] === TokenType.Number,
                    rhsIsValid = rhs instanceof Molecule || (Array.isArray(rhs) && rhs[0] === TokenType.Element),
                    shouldPass = lhsIsValid && rhsIsValid;

                it(`coefficient of ${lhs[0]} and ${rhs[0] || "molecule"} should ${
                    shouldPass ? "pass" : "fail"
                }`, () => {
                    const input = [lhs, rhs, exampleTokens[TokenType.Coefficient]];

                    if (shouldPass) {
                        expect(() => Stoik.evaluate(input)).not.toThrow();
                    } else {
                        expect(() => Stoik.evaluate(input)).toThrow();
                    }
                });
            });
        });
    });
});
