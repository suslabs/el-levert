import createEnum from "./createEnum.js";

const BoolStrings = createEnum(
    {
        true: "true",
        yes: "yes",
        y: "y",
        t: "t",
        false: "false",
        no: "no",
        n: "n",
        f: "f"
    },
    obj => {
        obj.truthy = new Set([obj.true, obj.yes, obj.y, obj.t]);
        obj.falsy = new Set([obj.false, obj.no, obj.n, obj.f]);
    }
);

export default BoolStrings;
