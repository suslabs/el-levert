import StoikError from "../../errors/StoikError.js";

class Molecule extends Map {
    static validElement(element) {
        return this._elementRegex.test(element);
    }

    static fromElement(element, frequency = 1) {
        return new Molecule(element, frequency);
    }

    constructor(...args) {
        const [rhs, rhsFreq = 1] = args;

        if (typeof rhs === "string") {
            super();

            if (rhsFreq !== 0) {
                this.set(rhs, rhsFreq);
            }

            return;
        }

        if (rhs instanceof Molecule) {
            super(rhs);
            return;
        }

        if (Array.isArray(rhs)) {
            const valid = rhs.map(([element, freq]) => {
                if (!Molecule.validElement(element)) {
                    throw new StoikError("Invalid element format", element);
                }

                return [element, freq ?? 1];
            });

            super(valid);
            return;
        }

        super();
    }

    set(key, value) {
        if (!Molecule.validElement(key)) {
            throw new StoikError("Invalid element format", key);
        }

        return super.set(key, value);
    }

    addMut(...args) {
        Molecule._addOrSubtract(this, false, ...args);
        return this;
    }

    add(...args) {
        const molecule = new Molecule(this);
        Molecule._addOrSubtract(molecule, false, ...args);

        return molecule;
    }

    subtractMut(...args) {
        Molecule._addOrSubtract(this, true, ...args);
        return this;
    }

    subtract(...args) {
        const molecule = new Molecule(this);
        Molecule._addOrSubtract(molecule, true, ...args);

        return molecule;
    }

    negateMut() {
        return Molecule._multiply(this, -1);
    }

    negate() {
        const molecule = new Molecule(this);
        return Molecule._multiply(molecule, -1);
    }

    multiplyMut(multiplier) {
        return Molecule._multiply(this, multiplier);
    }

    multiply(multiplier) {
        const molecule = new Molecule(this);
        return Molecule._multiply(molecule, multiplier);
    }

    static _elementRegex = /[A-Z][a-z]?/;

    static _updateElement(lhs, element, rhsFreq, subtract) {
        if (rhsFreq === 0) {
            return;
        }

        const current = lhs.get(element) ?? 0,
            newFreq = subtract ? current - rhsFreq : current + rhsFreq;

        newFreq === 0 ? lhs.delete(element) : lhs.set(element, newFreq);
    }

    static _addOrSubtract(lhs, subtract, ...args) {
        const [rhs, rhsFreq = 1] = args,
            isString = typeof rhs === "string";

        if (isString) {
            this._updateElement(lhs, rhs, rhsFreq, subtract);
        } else {
            for (const [element, rhsFreq] of rhs) {
                this._updateElement(lhs, element, rhsFreq, subtract);
            }
        }

        return lhs;
    }

    static _multiply(molecule, multiplier) {
        if (multiplier === 1) {
            return molecule;
        }

        for (const [element, freq] of molecule) {
            molecule.set(element, multiplier * freq);
        }

        return molecule;
    }
}

export default Molecule;
