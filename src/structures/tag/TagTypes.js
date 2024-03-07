const TagFlags = {
    new: 0b1,
    script: 0b10,
    vm2: 0b100
};

const defaultType = "text",
    defaultScriptType = "ivm",
    specialScriptTypes = ["vm2"];

const scriptTypes = [defaultScriptType].concat(specialScriptTypes);

const TagTypes = {
    defaultType,
    defaultScriptType,
    specialScriptTypes,
    scriptTypes
};

export { TagFlags, TagTypes };
