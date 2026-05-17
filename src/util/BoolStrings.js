const BoolStrings = Object.freeze({
    true: "true",
    yes: "yes",
    y: "y",
    t: "t",
    false: "false",
    no: "no",
    n: "n",
    f: "f"
});

const validBoolStrings = new Set(Object.values(BoolStrings));

const truthyStrings = new Set([BoolStrings.true, BoolStrings.yes, BoolStrings.y, BoolStrings.t]),
    falsyStrings = new Set([BoolStrings.false, BoolStrings.no, BoolStrings.n, BoolStrings.f]);

export { BoolStrings, validBoolStrings, truthyStrings, falsyStrings };
