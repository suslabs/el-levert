const AssignPropertyTypes = Object.freeze({
    enum: "enum",
    nonenum: "nonenum",
    both: "both",
    keys: "keys"
});

const validAssignPropertyTypes = new Set(Object.values(AssignPropertyTypes));

export { AssignPropertyTypes, validAssignPropertyTypes };
