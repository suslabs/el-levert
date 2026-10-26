import createEnum from "./createEnum.js";

const BoolStrings = createEnum(
    {
        true: "true",
        yes: "yes",
        y: "y",
        t: "t",
        1: "1",
        on: "on",
        false: "false",
        no: "no",
        n: "n",
        f: "f",
        0: "0",
        off: "off"
    },
    obj => {
        obj.truthy = new Set([obj.true, obj.yes, obj.y, obj.t, obj[1], obj.on]);
        obj.falsy = new Set([obj.false, obj.no, obj.n, obj.f, obj[0], obj.off]);
    }
);

export default BoolStrings;
