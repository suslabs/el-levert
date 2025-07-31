import Molecule from "./Molecule.js";

import TypeTester from "../../util/TypeTester.js";

import { TokenType, TokenNames, TokenOps, Precedence } from "./Tokens.js";

import StoikError from "../../errors/StoikError.js";

const Stoik = Object.freeze({
    tokenize: equation => {
        const tokens = equation.split(""),
            res = [];

        let idx = 0,
            parens = 0;

        while (idx < tokens.length) {
            const token = tokens[idx],
                charType = TypeTester.charType(token);

            if (charType === "number") {
                const numChars = [token];

                while (++idx < tokens.length) {
                    const nextToken = tokens[idx];

                    if (TypeTester.charType(nextToken) !== "number") {
                        break;
                    }

                    numChars.push(nextToken);
                }

                const value = Number.parseInt(numChars.join("")),
                    lastTuple = res[res.length - 1];

                if (lastTuple && lastTuple[0] === TokenType.Number) {
                    res.push([TokenType.Subscript]);
                    res.push([TokenType.Number, value]);
                } else if (
                    !lastTuple ||
                    lastTuple[0] === TokenType.GroupLeft ||
                    lastTuple[0] === TokenType.Join ||
                    lastTuple[0] === TokenType.Subtract
                ) {
                    res.push([TokenType.Number, value]);
                    res.push([TokenType.Coefficient]);
                } else if (lastTuple[0] === TokenType.Element || lastTuple[0] === TokenType.GroupRight) {
                    res.push([TokenType.Subscript]);
                    res.push([TokenType.Number, value]);
                } else {
                    const tokenName = TokenNames[lastTuple[0]] ?? "unknown token";

                    throw new StoikError(`Unexpected number after: ${tokenName} at index: ${idx}`, {
                        idx,
                        type: "number",
                        after: tokenName
                    });
                }
            } else if (charType === "uppercase") {
                const lastTuple = res[res.length - 1];

                if (lastTuple) {
                    const [lastType] = lastTuple;

                    if (
                        lastType === TokenType.Number ||
                        lastType === TokenType.Element ||
                        lastType === TokenType.GroupRight
                    ) {
                        res.push([TokenType.Add]);
                    }
                }

                const nextToken = tokens[idx + 1];

                if (TypeTester.charType(nextToken) === "lowercase") {
                    res.push([TokenType.Element, token + nextToken]);
                    idx++;
                } else {
                    res.push([TokenType.Element, token]);
                }

                idx++;
            } else if (token === TokenOps[TokenType.GroupLeft]) {
                const lastTuple = res[res.length - 1];

                if (lastTuple) {
                    const [lastType] = lastTuple;

                    if (
                        lastType === TokenType.Number ||
                        lastType === TokenType.Element ||
                        lastType === TokenType.GroupRight
                    ) {
                        res.push([TokenType.Add]);
                    }
                }

                res.push([TokenType.GroupLeft]);

                idx++;
                parens++;
            } else if (token === TokenOps[TokenType.GroupRight]) {
                if (parens === 0) {
                    throw new StoikError(`Unmatched right bracket at index: ${idx}`, {
                        idx,
                        type: "right bracket"
                    });
                }

                res.push([TokenType.GroupRight]);

                idx++;
                parens--;
            } else if (token === TokenOps[TokenType.Add]) {
                res.push([TokenType.Join]);
                idx++;
            } else if (token === TokenOps[TokenType.Subtract]) {
                res.push([TokenType.Subtract]);
                idx++;
            } else if (charType === "space") {
                idx++;
            } else {
                throw new StoikError(`Unexpected token: ${token} at index: ${idx}`, {
                    idx,
                    type: "token",
                    token
                });
            }
        }

        if (parens !== 0) {
            throw new StoikError(`Unmatched left bracket at index: ${idx}`, {
                idx,
                type: "left bracket"
            });
        }

        return res;
    },

    toRPN: input => {
        if (typeof input === "string") {
            input = Stoik.tokenize(input);
        } else {
            input = [...input];
        }

        const out = [],
            opStack = [];

        while (input.length > 0) {
            const token = input.shift(),
                [type] = token;

            switch (type) {
                case TokenType.Number:
                case TokenType.Element:
                    out.push(token);
                    break;

                case TokenType.GroupLeft:
                    opStack.push(token);
                    break;

                case TokenType.GroupRight:
                    while (opStack[opStack.length - 1]?.[0] !== TokenType.GroupLeft) {
                        out.push(opStack.pop());
                    }

                    opStack.pop();
                    break;

                default:
                    let prec = Precedence[type],
                        top;

                    while ((top = opStack[opStack.length - 1]) && prec <= Precedence[top[0]]) {
                        out.push(opStack.pop());
                    }

                    opStack.push(token);
                    break;
            }
        }

        while (opStack.length > 0) {
            out.push(opStack.pop());
        }

        return out;
    },

    evaluate: input => {
        if (typeof input === "string") {
            input = Stoik.toRPN(Stoik.tokenize(input));
        } else {
            input = [...input];
        }

        if (input.length < 1) {
            throw new StoikError("Empty input");
        }

        const opStack = [];

        while (input.length > 0) {
            const token = input.shift();

            if (token instanceof Molecule) {
                opStack.push(token);
                continue;
            }

            const [opType] = token;

            switch (opType) {
                case TokenType.Number:
                case TokenType.Element:
                    opStack.push(token);
                    break;

                default:
                    if (opStack.length < 1) {
                        throw new StoikError("Unexpected end of input");
                    }

                    const right = opStack.pop();

                    if (opStack.length < 1) {
                        throw new StoikError("Unexpected end of input");
                    }

                    const left = opStack.pop();

                    switch (opType) {
                        case TokenType.Subscript:
                            Stoik._handleSubscript(left, right, opStack);
                            break;

                        case TokenType.Coefficient:
                            Stoik._handleCoefficient(left, right, opStack);
                            break;

                        case TokenType.Subtract:
                        case TokenType.Join:
                        case TokenType.Add:
                            Stoik._handleOperation(left, right, opType, opStack);
                            break;
                    }

                    break;
            }
        }

        const evaluated = opStack.pop();

        if (evaluated instanceof Molecule) {
            return evaluated;
        }

        if (Array.isArray(evaluated) && evaluated[0] === TokenType.Element) {
            return Molecule.fromElement(evaluated[1]);
        }

        throw new StoikError(`Unexpected result type: ${TypeTester.className(evaluated)}`);
    },

    formatEquation(lhs, rhs) {
        const elements = new Set([...lhs.keys(), ...rhs.keys()]);

        const reactants = [],
            products = [];

        for (const element of elements) {
            reactants.push({
                element,
                count: lhs.get(element) ?? 0
            });

            products.push({
                element,
                count: rhs.get(element) ?? 0
            });
        }

        return { reactants, products };
    },

    checkBalance: equation => {
        const { reactants, products } = equation;

        let res = Array(reactants.length),
            balanced = true;

        for (const [i, reactant] of reactants.entries()) {
            const { element, count: reactantCount } = reactant,
                productCount = products[i].count;

            const elemBalanced = reactantCount === productCount;
            balanced &&= elemBalanced;

            res[i] = {
                element,
                reactantCount,
                productCount,
                balanced: elemBalanced
            };
        }

        return [balanced, res];
    },

    _handleSubscript: (left, right, opStack) => {
        if (!(left instanceof Molecule)) {
            if (!Array.isArray(left) || left[0] !== TokenType.Element) {
                throw new StoikError("Invalid left operand for subscript", {
                    type: "left operand",
                    for: "subscript"
                });
            }

            left = Molecule.fromElement(left[1]);
        }

        if (!Array.isArray(right) || right[0] !== TokenType.Number) {
            throw new StoikError("Invalid right operand for subscript", {
                type: "right operand",
                for: "subscript"
            });
        }

        opStack.push(left.multiplyMut(right[1]));
    },

    _handleCoefficient: (left, right, opStack) => {
        if (!Array.isArray(left) || left[0] !== TokenType.Number) {
            throw new StoikError("Invalid left operand for coefficient", {
                type: "left operand",
                for: "coefficient"
            });
        }

        if (!(right instanceof Molecule)) {
            if (!Array.isArray(right) || right[0] !== TokenType.Element) {
                throw new StoikError("Invalid right operand for coefficient", {
                    type: "right operand",
                    for: "coefficient"
                });
            }

            right = Molecule.fromElement(right[1]);
        }

        opStack.push(right.multiplyMut(left[1]));
    },

    _handleOperation: (left, right, opType, opStack) => {
        if (!(left instanceof Molecule)) {
            if (!Array.isArray(left) || left[0] !== TokenType.Element) {
                throw new StoikError("Invalid left operand for operation", {
                    type: "left operand",
                    for: "operation"
                });
            }

            left = Molecule.fromElement(left[1]);
        }

        if (!(right instanceof Molecule)) {
            if (!Array.isArray(right) || right[0] !== TokenType.Element) {
                throw new StoikError("Invalid right operand for operation", {
                    type: "right operand",
                    for: "operation"
                });
            }

            right = Molecule.fromElement(right[1]);
        }

        if (opType === TokenType.Subtract) {
            left.subtractMut(right);
        } else {
            left.addMut(right);
        }

        opStack.push(left);
    }
});

export default Stoik;
