import createEnum from "./createEnum.js";

const AssignPropertyTypes = createEnum({
    enum: "enum",
    nonenum: "nonenum",
    both: "both",
    keys: "keys"
});

export default AssignPropertyTypes;
